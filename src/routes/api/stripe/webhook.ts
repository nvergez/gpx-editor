import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { getStripe, getConvexWebhookSecret } from '~/lib/stripe'
import { getConvexClient } from '~/lib/convex-server'
import { logger } from '~/utils/logger'
import { reportError, toError } from '~/utils/error-reporter'
import { api } from '../../../../convex/_generated/api'

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return secret
}

export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now()
        const stripe = getStripe()
        const body = await request.text()
        const sig = request.headers.get('stripe-signature')

        if (!sig) {
          return new Response('Missing stripe-signature header', { status: 400 })
        }

        let event: Stripe.Event
        try {
          event = stripe.webhooks.constructEvent(body, sig, getWebhookSecret())
        } catch (err) {
          const error = toError(err)
          reportError(error, { context: 'stripe-webhook-signature' })
          return new Response(`Webhook signature verification failed: ${error.message}`, {
            status: 400,
          })
        }

        logger.info('Stripe webhook received', { eventType: event.type, eventId: event.id })

        const convex = getConvexClient()
        const webhookSecret = getConvexWebhookSecret()

        try {
          switch (event.type) {
            case 'checkout.session.completed': {
              await handleCheckoutCompleted(convex, webhookSecret, event.data.object)
              break
            }

            case 'invoice.paid': {
              await handleInvoicePaid(convex, webhookSecret, event.data.object)
              break
            }

            case 'customer.subscription.deleted': {
              await handleSubscriptionDeleted(convex, webhookSecret, event.data.object)
              break
            }

            default:
              logger.info('Unhandled Stripe event type', { eventType: event.type })
          }
        } catch (err) {
          const duration = Date.now() - startTime
          reportError(toError(err), {
            context: 'stripe-webhook',
            eventType: event.type,
            durationMs: duration,
          })
          return new Response('Webhook processing error', { status: 500 })
        }

        logger.info('Stripe webhook processed', {
          eventType: event.type,
          durationMs: Date.now() - startTime,
        })

        return new Response('ok', { status: 200 })
      },
    },
  },
})

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  convex: ReturnType<typeof getConvexClient>,
  webhookSecret: string,
  session: Stripe.Checkout.Session,
) {
  const tokenIdentifier = session.metadata?.tokenIdentifier
  if (!tokenIdentifier) {
    logger.error('checkout.session.completed: missing tokenIdentifier in metadata')
    return
  }

  const type = session.metadata?.type

  if (type === 'subscription') {
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

    if (!customerId || !subscriptionId) {
      logger.error('checkout.session.completed: missing customer or subscription ID')
      return
    }

    await convex.action(api.stripe.handleSubscriptionCreated, {
      webhookSecret,
      tokenIdentifier,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    })

    logger.info('Subscription created', { tokenIdentifier })
  } else if (type === 'credit_pack') {
    const credits = Number(session.metadata?.credits)
    if (!credits || credits <= 0) {
      logger.error('checkout.session.completed: invalid credits in metadata')
      return
    }

    await convex.action(api.stripe.handleCreditPackPurchased, {
      webhookSecret,
      tokenIdentifier,
      credits,
      checkoutSessionId: session.id,
    })

    logger.info('Credit pack purchased', { credits, tokenIdentifier })
  }
}

async function handleInvoicePaid(
  convex: ReturnType<typeof getConvexClient>,
  webhookSecret: string,
  invoice: Stripe.Invoice,
) {
  // Only process subscription renewals, not the initial creation
  if (invoice.billing_reason === 'subscription_create') {
    return
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id

  if (!customerId) {
    logger.error('invoice.paid: missing customer ID')
    return
  }

  await convex.action(api.stripe.handleInvoicePaid, {
    webhookSecret,
    stripeCustomerId: customerId,
  })

  logger.info('Invoice paid (renewal)', { customerId })
}

async function handleSubscriptionDeleted(
  convex: ReturnType<typeof getConvexClient>,
  webhookSecret: string,
  subscription: Stripe.Subscription,
) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

  if (!customerId) {
    logger.error('customer.subscription.deleted: missing customer ID')
    return
  }

  await convex.action(api.stripe.handleSubscriptionDeleted, {
    webhookSecret,
    stripeCustomerId: customerId,
  })

  logger.info('Subscription deleted', { customerId })
}

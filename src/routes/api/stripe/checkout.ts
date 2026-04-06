import { createFileRoute } from '@tanstack/react-router'
import { fetchAuthMutation } from '~/lib/auth-server'
import { getStripe, getSiteUrl } from '~/lib/stripe'
import { PLANS, CREDIT_PACKS, type CreditPackId } from '~/lib/pricing'
import { logger } from '~/utils/logger'
import { reportError, toError } from '~/utils/error-reporter'
import { api } from '../../../../convex/_generated/api'

export const Route = createFileRoute('/api/stripe/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now()

        try {
          const body = await request.json()
          const { type, packId } = body as {
            type: 'subscription' | 'credit_pack'
            packId?: CreditPackId
          }

          logger.info('Checkout started', { type, packId })

          // Authenticate via Better Auth → Convex
          const profile = await fetchAuthMutation(api.credits.ensureProfile)
          if (!profile) {
            return new Response(JSON.stringify({ error: 'Not authenticated' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const stripe = getStripe()
          const siteUrl = getSiteUrl()

          // Create or reuse Stripe customer
          let stripeCustomerId = profile.stripeCustomerId
          if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
              metadata: { tokenIdentifier: profile.tokenIdentifier },
            })
            stripeCustomerId = customer.id

            // Store the Stripe customer ID in Convex
            await fetchAuthMutation(api.credits.setMyStripeCustomerId, {
              stripeCustomerId,
            })
          }

          if (type === 'subscription') {
            // Don't allow subscribing if already premium
            if (profile.plan === 'premium') {
              return Response.json({ error: 'Already subscribed to Premium' }, { status: 400 })
            }

            const premium = PLANS.premium

            const session = await stripe.checkout.sessions.create({
              customer: stripeCustomerId,
              mode: 'subscription',
              line_items: [
                {
                  price_data: {
                    currency: 'eur',
                    unit_amount: premium.priceEurCents,
                    recurring: { interval: 'month' },
                    product_data: {
                      name: `Lapcraft ${premium.name}`,
                      description: `${premium.monthlyCredits} AI credits/month, unlimited activities & custom columns`,
                    },
                  },
                  quantity: 1,
                },
              ],
              metadata: {
                tokenIdentifier: profile.tokenIdentifier,
                type: 'subscription',
              },
              success_url: `${siteUrl}/pricing?checkout=success`,
              cancel_url: `${siteUrl}/pricing?checkout=cancel`,
            })

            logger.info('Checkout session created', { type: 'subscription' })
            return Response.json({ url: session.url })
          }

          if (type === 'credit_pack') {
            const pack = packId ? CREDIT_PACKS[packId] : undefined
            if (!pack) {
              return Response.json({ error: 'Invalid pack ID' }, { status: 400 })
            }

            const session = await stripe.checkout.sessions.create({
              customer: stripeCustomerId,
              mode: 'payment',
              line_items: [
                {
                  price_data: {
                    currency: 'eur',
                    unit_amount: pack.priceEurCents,
                    product_data: {
                      name: `Lapcraft ${pack.label}`,
                      description: `${pack.credits} AI credits for Lapcraft`,
                    },
                  },
                  quantity: 1,
                },
              ],
              metadata: {
                tokenIdentifier: profile.tokenIdentifier,
                type: 'credit_pack',
                credits: String(pack.credits),
              },
              success_url: `${siteUrl}/pricing?checkout=success`,
              cancel_url: `${siteUrl}/pricing?checkout=cancel`,
            })

            logger.info('Checkout session created', { type: 'credit_pack', packId })
            return Response.json({ url: session.url })
          }

          return Response.json({ error: 'Invalid checkout type' }, { status: 400 })
        } catch (err) {
          const duration = Date.now() - startTime
          reportError(toError(err), { context: 'stripe-checkout', durationMs: duration })
          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})

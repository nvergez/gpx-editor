import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { getServerConvexConfig } from './convex-env'

const { convexUrl, convexSiteUrl } = getServerConvexConfig()

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({
    convexUrl,
    convexSiteUrl,
  })

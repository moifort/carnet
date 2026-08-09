import { UserId } from '~/domain/shared/primitives'
import {
  AdminToken,
  ApiToken,
  AppleAppId,
  AppleEnvironment,
  ElectroluxApiKey,
  ElectroluxRefreshToken,
  GoogleApiKey,
  PremiumUserIds,
} from '~/system/config/primitives'

// Each field is validated when it is read, not when `config()` is called: a
// missing Gemini key must break the AI, not the quota that gates it.
export const config = () => {
  const runtimeConfig = useRuntimeConfig()
  return {
    get apiToken() {
      return runtimeConfig.apiToken ? ApiToken(runtimeConfig.apiToken) : undefined
    },
    get adminToken() {
      return runtimeConfig.adminToken ? AdminToken(runtimeConfig.adminToken) : undefined
    },
    get googleApiKey() {
      return GoogleApiKey(runtimeConfig.googleApiKey)
    },
    get premiumUserIds() {
      return PremiumUserIds(runtimeConfig.premiumUserIds)
    },
    get appleAppId() {
      return runtimeConfig.appleAppId ? AppleAppId(runtimeConfig.appleAppId) : undefined
    },
    get appleEnvironment() {
      return runtimeConfig.appleEnvironment
        ? AppleEnvironment(runtimeConfig.appleEnvironment)
        : undefined
    },
    // The connected oven: all three or nothing. Read together so the feature can
    // never be half-on — a key without an owner would drive somebody else's oven.
    get electrolux() {
      const { electroluxApiKey, electroluxRefreshToken, electroluxUserId } = runtimeConfig
      if (!electroluxApiKey || !electroluxRefreshToken || !electroluxUserId) return undefined
      return {
        apiKey: ElectroluxApiKey(electroluxApiKey),
        refreshToken: ElectroluxRefreshToken(electroluxRefreshToken),
        ownerId: UserId(electroluxUserId),
      }
    },
  }
}

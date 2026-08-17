// @myapp/shared - Type definitions
// Shared TypeScript types, interfaces, and Zod schemas for validation

import { z } from 'zod'

// ============================================
// Base Entity Types
// ============================================

export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
}

export interface Timestamped {
  createdAt: Date
  updatedAt: Date
}

// ============================================
// User & Authentication Types
// ============================================

export interface User extends BaseEntity {
  email: string
  name: string
  avatarUrl?: string
  preferences: UserPreferences
  lastLoginAt?: Date
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  notifications: NotificationPreferences
  privacy: PrivacyPreferences
}

export interface NotificationPreferences {
  email: boolean
  push: boolean
  inApp: boolean
  marketing: boolean
}

export interface PrivacyPreferences {
  analytics: boolean
  crashReporting: boolean
  personalizedAds: boolean
}

// ============================================
// App Configuration Types
// ============================================

export interface AppConfig {
  name: string
  version: string
  environment: 'development' | 'staging' | 'production'
  apiBaseUrl: string
  features: FeatureFlags
}

export interface FeatureFlags {
  enableBetaFeatures: boolean
  enableOfflineMode: boolean
  enableAnalytics: boolean
  enableCrashReporting: boolean
  maxFileSize: number
  allowedFileTypes: string[]
}

// ============================================
// Platform-Specific Types
// ============================================

export type Platform = 'web' | 'desktop' | 'mobile'

export interface PlatformInfo {
  platform: Platform
  version: string
  isElectron: boolean
  isWeb: boolean
  userAgent: string
  screenResolution?: { width: number; height: number }
}

// ============================================
// Zod Validation Schemas
// ============================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string().min(2).max(5),
    notifications: z.object({
      email: z.boolean(),
      push: z.boolean(),
      inApp: z.boolean(),
      marketing: z.boolean()
    }),
    privacy: z.object({
      analytics: z.boolean(),
      crashReporting: z.boolean(),
      personalizedAds: z.boolean()
    })
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional()
})

export const AppConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().semver(),
  environment: z.enum(['development', 'staging', 'production']),
  apiBaseUrl: z.string().url(),
  features: z.object({
    enableBetaFeatures: z.boolean(),
    enableOfflineMode: z.boolean(),
    enableAnalytics: z.boolean(),
    enableCrashReporting: z.boolean(),
    maxFileSize: z.number().positive(),
    allowedFileTypes: z.array(z.string())
  })
})

// ============================================
// Type Guards
// ============================================

export function isUser(obj: unknown): obj is User {
  return UserSchema.safeParse(obj).success
}

export function isAppConfig(obj: unknown): obj is AppConfig {
  return AppConfigSchema.safeParse(obj).success
}

// ============================================
// Inferred Types from Schemas
// ============================================

export type UserInput = z.input<typeof UserSchema>
export type UserOutput = z.output<typeof UserSchema>
export type AppConfigInput = z.input<typeof AppConfigSchema>
export type AppConfigOutput = z.output<typeof AppConfigSchema>
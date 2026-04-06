type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const IS_SERVER = typeof window === 'undefined'
const IS_PRODUCTION = typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
const MIN_LEVEL: number = IS_PRODUCTION ? LEVEL_PRIORITY.info : LEVEL_PRIORITY.debug

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (LEVEL_PRIORITY[level] < MIN_LEVEL) return

  if (IS_SERVER) {
    if (IS_PRODUCTION) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          message,
          ...(data && { data }),
          service: 'lapcraft',
        }),
      )
    } else {
      console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}]`, message, data ?? '')
    }
  } else if (!IS_PRODUCTION) {
    console[level](`[CLIENT] [${level.toUpperCase()}]`, message, data ?? '')
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
}

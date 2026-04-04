import { useCallback, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { Upload, MapPin, Mountain, ArrowRight } from 'lucide-react'
import { StravaActivityPicker } from '~/components/strava-activity-picker'
import { getStravaAuthUrl, StravaLogo } from '~/utils/strava'
import * as m from '~/paraglide/messages.js'

interface GpxUploadProps {
  onFileLoaded: (xmlString: string) => void
  onStravaFileLoaded?: (xmlString: string, stravaActivityId?: number) => void
}

export function GpxUpload({ onFileLoaded, onStravaFileLoaded }: GpxUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [stravaPickerOpen, setStravaPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: stravaConnection, isLoading: isLoadingConnection } = useQuery(
    convexQuery(api.strava.getConnection, {}),
  )

  const stravaAuthUrl = getStravaAuthUrl()
  const showStrava = !!stravaAuthUrl || !!stravaConnection

  const handleFile = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.gpx') && !name.endsWith('.tcx')) {
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result
        if (typeof text === 'string') {
          onFileLoaded(text)
        }
      }
      reader.readAsText(file)
    },
    [onFileLoaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleStravaFileLoaded = useCallback(
    (xmlString: string, stravaActivityId?: number) => {
      if (onStravaFileLoaded) {
        onStravaFileLoaded(xmlString, stravaActivityId)
      } else {
        onFileLoaded(xmlString)
      }
    },
    [onFileLoaded, onStravaFileLoaded],
  )

  return (
    <div className="flex flex-col items-center pt-12">
      {/* Hero area */}
      <div className="text-center mb-10 space-y-3">
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
          {m.upload_hero_title()}
        </h2>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          {m.upload_hero_desc()}
        </p>
      </div>

      {/* Import options */}
      <div className={`w-full ${showStrava ? 'max-w-2xl' : 'max-w-xl'}`}>
        <div className={`grid gap-4 ${showStrava ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {/* File upload zone */}
          <div
            className={`topo-bg group relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ${
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/5'
                : 'border-warm-300 hover:border-primary/60 hover:shadow-md hover:shadow-primary/5 dark:border-warm-600'
            }`}
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
              <div
                className={`rounded-full p-4 transition-all duration-300 ${
                  isDragging
                    ? 'bg-primary/15 text-primary scale-110'
                    : 'bg-warm-100 text-warm-500 group-hover:bg-primary/10 group-hover:text-primary dark:bg-warm-800 dark:text-warm-400'
                }`}
              >
                <Upload className="size-6" strokeWidth={1.5} />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-base font-medium text-foreground">{m.upload_import_file()}</p>
                <p className="text-sm text-muted-foreground">{m.upload_drop_hint()}</p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".gpx,.tcx"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>

          {/* Strava zone */}
          {showStrava && (
            <>
              {stravaConnection ? (
                /* Connected — activity picker trigger */
                <button
                  type="button"
                  onClick={() => setStravaPickerOpen(true)}
                  className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-[#FC4C02]/25 transition-all duration-300 hover:border-[#FC4C02]/50 hover:shadow-md hover:shadow-[#FC4C02]/5 bg-gradient-to-br from-[#FC4C02]/[0.03] to-transparent"
                >
                  <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                    <div className="rounded-full p-4 bg-[#FC4C02]/10 text-[#FC4C02] transition-all duration-300 group-hover:bg-[#FC4C02]/15 group-hover:scale-105">
                      <StravaLogo className="size-6" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-base font-medium text-foreground">
                        {m.upload_import_strava()}
                      </p>
                      <p className="text-sm text-muted-foreground">{m.upload_browse_strava()}</p>
                    </div>
                  </div>
                </button>
              ) : isLoadingConnection ? (
                /* Loading state */
                <div className="rounded-2xl border-2 border-dashed border-warm-300/50 dark:border-warm-600/50">
                  <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                    <div className="rounded-full p-4 bg-warm-100 dark:bg-warm-800 animate-pulse">
                      <div className="size-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-warm-100 dark:bg-warm-800 rounded animate-pulse mx-auto" />
                      <div className="h-3 w-32 bg-warm-100 dark:bg-warm-800 rounded animate-pulse mx-auto" />
                    </div>
                  </div>
                </div>
              ) : (
                /* Not connected — discovery CTA */
                <a
                  href={stravaAuthUrl!}
                  className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-warm-300 transition-all duration-300 hover:border-[#FC4C02]/40 hover:shadow-md hover:shadow-[#FC4C02]/5 dark:border-warm-600 dark:hover:border-[#FC4C02]/40"
                >
                  <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                    <div className="rounded-full p-4 bg-warm-100 text-warm-400 transition-all duration-300 group-hover:bg-[#FC4C02]/10 group-hover:text-[#FC4C02] dark:bg-warm-800 dark:text-warm-500">
                      <StravaLogo className="size-6" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-base font-medium text-foreground">
                        {m.upload_connect_strava()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {m.upload_connect_strava_desc()}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FC4C02] opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                      {m.upload_connect_now()}
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <StravaActivityPicker
        open={stravaPickerOpen}
        onOpenChange={setStravaPickerOpen}
        onFileLoaded={handleStravaFileLoaded}
      />

      {/* Feature hints */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-xl w-full">
        {[
          { icon: MapPin, label: m.upload_feature_split(), desc: m.upload_feature_split_desc() },
          { icon: Mountain, label: m.upload_feature_stats(), desc: m.upload_feature_stats_desc() },
          { icon: Upload, label: m.upload_feature_export(), desc: m.upload_feature_export_desc() },
        ].map((feat) => (
          <div key={feat.label} className="flex flex-col items-center text-center gap-2 py-3">
            <feat.icon className="size-4.5 text-warm-400 dark:text-warm-500" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium text-foreground">{feat.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

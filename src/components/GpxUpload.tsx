import { useCallback, useRef, useState } from 'react'
import { Upload, MapPin, Mountain } from 'lucide-react'

interface GpxUploadProps {
  onFileLoaded: (xmlString: string) => void
}

export function GpxUpload({ onFileLoaded }: GpxUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="flex flex-col items-center pt-12">
      {/* Hero area */}
      <div className="text-center mb-10 space-y-3">
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
          Edit your activities
        </h2>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          Split, merge, rename, and reorder laps in your GPX and TCX files. Lossless round-trip editing.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`topo-bg group relative w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/5'
            : 'border-warm-300 hover:border-primary/60 hover:shadow-md hover:shadow-primary/5 dark:border-warm-600'
        }`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center justify-center py-20 px-8 gap-5">
          <div className={`rounded-full p-4 transition-all duration-300 ${
            isDragging
              ? 'bg-primary/15 text-primary scale-110'
              : 'bg-warm-100 text-warm-500 group-hover:bg-primary/10 group-hover:text-primary dark:bg-warm-800 dark:text-warm-400'
          }`}>
            <Upload className="size-7" strokeWidth={1.5} />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-lg font-medium text-foreground">
              Drop your file here
            </p>
            <p className="text-sm text-muted-foreground">
              GPX or TCX — click to browse
            </p>
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

      {/* Feature hints */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-xl w-full">
        {[
          { icon: MapPin, label: 'Split & merge', desc: 'Break laps apart or combine them' },
          { icon: Mountain, label: 'Full stats', desc: 'Distance, pace, HR, power, elevation' },
          { icon: Upload, label: 'Lossless export', desc: 'Preserves all original XML data' },
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

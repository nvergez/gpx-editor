import { createFileRoute } from '@tanstack/react-router'
import { GpxEditor } from '~/components/gpx-editor'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <GpxEditor />
}

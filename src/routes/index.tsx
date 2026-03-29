import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/components/auth-gate'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <AuthGate />
}

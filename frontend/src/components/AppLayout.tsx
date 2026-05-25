import { type ReactNode } from 'react'
import BottomNav from './BottomNav'

interface Props {
  children: ReactNode
}

export default function AppLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-black flex justify-center">
      {/* 
        Ограничиваем ширину до 600px как указано в DESIGN.md:
        "On larger devices, content is capped at a 600px max-width"
      */}
      <div className="w-full max-w-[600px] relative flex flex-col min-h-screen bg-black">
        <main className="flex-1 pb-[140px] overflow-y-auto">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}

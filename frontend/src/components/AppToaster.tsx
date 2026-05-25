import { Toaster } from 'react-hot-toast'
import { toastStyle } from '../lib/toast'

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      containerClassName="!top-[max(1rem,env(safe-area-inset-top))] !z-[200]"
      containerStyle={{ zIndex: 200 }}
      toastOptions={{
        style: toastStyle,
        success: {
          iconTheme: {
            primary: '#FF1A4F',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ff5167',
            secondary: '#fff',
          },
        },
      }}
    />
  )
}

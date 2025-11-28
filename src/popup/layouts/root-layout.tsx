import type { CSSProperties } from "react"

import { ClerkProvider } from "@clerk/chrome-extension"
import { Outlet, useLocation, useNavigate } from "react-router"

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Please add the PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env.development file")
}

const extensionPopupUrl =
  typeof chrome !== "undefined" && chrome.runtime?.getURL
    ? chrome.runtime.getURL("popup.html")
    : "/"

export const RootLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthRoute = ["/sign-in", "/sign-up", "/settings"].includes(location.pathname)

  const containerStyle: CSSProperties = isAuthRoute
    ? { width: 360, minHeight: 520 }
    : { width: 300 }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl={extensionPopupUrl}
      signUpFallbackRedirectUrl={extensionPopupUrl}>
      <div className="extension-root" style={containerStyle}>
        <Outlet />
      </div>
    </ClerkProvider>
  )
}

export default RootLayout

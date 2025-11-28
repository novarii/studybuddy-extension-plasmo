import { SignInButton, SignedIn, SignedOut, UserProfile } from "@clerk/chrome-extension"

export const Settings = () => (
  <div className="extension-card">
    <SignedIn>
      <UserProfile routing="path" path="/settings" />
    </SignedIn>
    <SignedOut>
      <p className="page-info">Please sign in to manage your profile.</p>
      <SignInButton mode="modal">
        <button>Sign in</button>
      </SignInButton>
    </SignedOut>
  </div>
)

export default Settings

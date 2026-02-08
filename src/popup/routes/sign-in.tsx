import { SignIn } from "@clerk/chrome-extension"

export const SignInPage = () => (
  <div className="extension-card">
    <SignIn routing="hash" />
  </div>
)

export default SignInPage

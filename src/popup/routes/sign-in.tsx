import { SignIn } from "@clerk/chrome-extension"

export const SignInPage = () => (
  <div className="extension-card">
    <SignIn routing="path" path="/sign-in" />
  </div>
)

export default SignInPage

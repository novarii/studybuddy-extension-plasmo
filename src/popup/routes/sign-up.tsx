import { SignUp } from "@clerk/chrome-extension"

export const SignUpPage = () => (
  <div className="extension-card">
    <SignUp routing="path" path="/sign-up" />
  </div>
)

export default SignUpPage

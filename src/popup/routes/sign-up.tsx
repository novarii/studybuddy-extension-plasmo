import { SignUp } from "@clerk/chrome-extension"

export const SignUpPage = () => (
  <div className="extension-card">
    <SignUp routing="hash" />
  </div>
)

export default SignUpPage

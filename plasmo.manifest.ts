const clerkHost = process.env.CLERK_FRONTEND_API ? `${process.env.CLERK_FRONTEND_API}/*` : null

const manifest = {
  manifest_version: 3,
  name: "Study Buddy",
  version: "1.0.0",
  description: "Send Panopto videos to Study Buddy",
  permissions: ["storage", "activeTab", "tabs", "scripting", "notifications", "cookies"],
  host_permissions: [
    "https://*.panopto.com/*",
    "https://*.panopto.eu/*",
    "http://localhost:8000/*",
    "http://localhost/*",
    ...(clerkHost ? [clerkHost] : [])
  ],
  action: {
    default_title: "Study Buddy",
    default_popup: "popup.html",
    default_icon: {
      16: "assets/icon16.png",
      48: "assets/icon48.png",
      128: "assets/icon128.png"
    }
  },
  background: {
    service_worker: "background.js",
    type: "module"
  },
  options_ui: {
    page: "options.html",
    open_in_tab: true
  },
  icons: {
    16: "assets/icon16.png",
    48: "assets/icon48.png",
    128: "assets/icon128.png"
  }
}

export default manifest

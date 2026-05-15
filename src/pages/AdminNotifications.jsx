// src/pages/AdminNotifications.jsx
import { useState } from 'react'
import { useAdminNotificationStore } from '../store/notificationStore'
import { WEEKS } from '../store/useStore'

export default function AdminNotifications() {
  const { enabled, enabledSince, lastModifiedBy, toggle, enable, disable } =
    useAdminNotificationStore()
  const [testStatus, setTestStatus] = useState(null)

  const adminName = 'Admin' // In production, this comes from auth

  const handleToggle = () => {
    if (enabled) {
      if (
        confirm(
          'Disable notifications for ALL users? This will stop all scheduled key point deliveries immediately.'
        )
      ) {
        disable(adminName)
      }
    } else {
      if (
        confirm(
          'Enable notifications for ALL users? This will start delivering key points every 2 hours.'
        )
      ) {
        enable(adminName)
      }
    }
  }

  const handleTestNotification = () => {
    setTestStatus('Sending test...')

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📚 Test Key Point', {
        body: 'This is a test notification. Key points will look like this for your students!',
        icon: '/icon-192.png',
        tag: 'test-notification',
      })
    } else if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification('📚 Test Key Point', {
            body: 'This is a test notification. Key points will look like this for your students!',
            icon: '/icon-192.png',
            tag: 'test-notification',
          })
        }
      })
    }

    setTimeout(() => setTestStatus('Test sent! Check your notifications.'), 500)
    setTimeout(() => setTestStatus(null), 3000)
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-1">
            Admin Panel
          </p>
          <h1 className="text-2xl font-bold text-[#111] font-display">
            Notification Control
          </h1>
          <p className="text-sm text-[#888] font-label mt-1">
            Master switch for key point push notifications
          </p>
        </div>

        {/* Master Toggle */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-[#111] font-display">
                Notification Service
              </p>
              <p className="text-xs text-[#888] font-label mt-0.5">
                {enabled
                  ? 'Notifications are LIVE — users receive key points every 2 hours'
                  : 'Notifications are OFF — no key points are being sent'}
              </p>
            </div>
            <button
              onClick={handleToggle}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                enabled ? 'bg-green-500' : 'bg-[#DDD]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  enabled ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Status Details */}
          {enabled && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="text-sm font-bold text-green-800 font-display">Service Active</p>
              </div>
              <div className="space-y-1 text-xs text-green-700 font-label">
                <p>• Enabled since: {enabledSince ? new Date(enabledSince).toLocaleString() : 'Unknown'}</p>
                <p>• Last modified by: {lastModifiedBy || 'Unknown'}</p>
                <p>• Interval: Every 2 hours</p>
                <p>• Max views per point: 3 times</p>
                <p>• Points cycle: Yes (resets when all seen 3×)</p>
                <p>• Week-based: Content auto-updates each week</p>
              </div>
            </div>
          )}

          {!enabled && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <p className="text-sm text-yellow-800 font-label">
                ⚠️ Notifications are currently disabled. Users will not receive key point deliveries.
                Enable this when you're ready to start engaging users.
              </p>
            </div>
          )}

          {/* Test Button */}
          <button
            onClick={handleTestNotification}
            className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display mt-4"
          >
            {testStatus || 'Send Test Notification'}
          </button>
        </div>

        {/* How It Works */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 mb-6">
          <h3 className="text-sm font-bold text-[#111] font-display mb-3">How It Works</h3>
          <div className="space-y-3">
            {[
              {
                emoji: '1️⃣',
                title: 'Scheduled Delivery',
                desc: 'Key points for the current week\'s topics are delivered every 2 hours via push notification.',
              },
              {
                emoji: '2️⃣',
                title: 'Smart Cycling',
                desc: 'Each point is shown up to 3 times before cycling to the next. After all points have been seen, the cycle resets. Repetition reinforces learning.',
              },
              {
                emoji: '3️⃣',
                title: 'Patches Mode',
                desc: 'When users activate Patches, notifications switch to only show key points from subjects where they scored below 50%. Laser-focused on weak areas.',
              },
              {
                emoji: '4️⃣',
                title: 'Week-Based Content',
                desc: 'Content automatically updates when the week changes. No manual intervention needed — old notifications stop, new ones begin.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="text-lg shrink-0">{item.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-[#111] font-label">{item.title}</p>
                  <p className="text-[11px] text-[#888] font-label">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-red-800 font-display mb-2">Danger Zone</h3>
          <p className="text-xs text-red-600 font-label mb-3">
            Disabling notifications will stop ALL scheduled deliveries immediately. Users will not
            receive any more key points until re-enabled.
          </p>
          {enabled && (
            <button
              onClick={() => {
                if (confirm('Are you sure? This stops all notifications for all users.')) {
                  disable(adminName)
                }
              }}
              className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-red-700 active:scale-[0.99] transition-all font-display"
            >
              ⚠️ Emergency Stop — Disable All Notifications
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
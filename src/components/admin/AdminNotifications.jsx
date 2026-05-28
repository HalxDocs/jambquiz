import { useState } from 'react'
import { useAdminNotificationStore } from '../../store/notificationStore'
import { saveAdminNotificationStateToFirestore } from '../../services/pushNotifications'
import { db, collection, addDoc, functions, httpsCallable } from '../../firebase'

export default function AdminNotifications() {
  const { enabled, enabledSince, lastModifiedBy, enable, disable } = useAdminNotificationStore()
  const [testStatus, setTestStatus] = useState(null)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastTarget, setBroadcastTarget] = useState('all')
  const [broadcastStatus, setBroadcastStatus] = useState(null)
  const [pushTestStatus, setPushTestStatus] = useState(null)

  const adminName = 'Admin'

  const handleToggle = () => {
    if (enabled) {
      if (confirm('Disable notifications for ALL users? This will stop all scheduled key point deliveries immediately.')) {
        disable(adminName)
        saveAdminNotificationStateToFirestore(false)
      }
    } else {
      if (confirm('Enable notifications for ALL users? This will start delivering key points every 2 hours.')) {
        enable(adminName)
        saveAdminNotificationStateToFirestore(true)
      }
    }
  }

  const handleTestPush = async () => {
    setPushTestStatus('Sending...')
    try {
      const fn = httpsCallable(functions, 'testPushToAll')
      const result = await fn()
      if (result.data.ok) {
        setPushTestStatus(`Sent to ${result.data.sent}/${result.data.total} device(s). Check your phone!`)
      } else {
        setPushTestStatus('Failed: ' + result.data.reason)
      }
    } catch (err) {
      setPushTestStatus('Error: ' + (err.message || 'Unknown'))
    }
    setTimeout(() => setPushTestStatus(null), 8000)
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

  const handleSendBroadcast = async () => {
    const title = broadcastTitle.trim()
    const message = broadcastMessage.trim()
    if (!title || !message) return

    setBroadcastStatus('Sending...')
    try {
      await addDoc(collection(db, 'admin_broadcasts'), { title, message, target: broadcastTarget, createdAt: new Date().toISOString() })
      setBroadcastStatus('Broadcast sent!')
      setBroadcastTitle('')
      setBroadcastMessage('')
      setBroadcastTarget('all')
    } catch (err) {
      setBroadcastStatus('Failed: ' + (err.message || 'Unknown error'))
    }
    setTimeout(() => setBroadcastStatus(null), 5000)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-sm font-bold text-[#111] font-display">Notification Service</p>
            <p className="text-xs text-[#888] font-label mt-0.5">
              {enabled
                ? 'Notifications are LIVE — users receive key points every 2 hours'
                : 'Notifications are OFF — no key points are being sent'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`relative w-14 h-7 rounded-full shrink-0 transition-colors ${
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

        <button
          onClick={handleTestNotification}
          className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display mt-4"
        >
          {testStatus || 'Send Test Notification (in-browser)'}
        </button>
        <button
          onClick={handleTestPush}
          disabled={pushTestStatus === 'Sending...'}
          className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-blue-700 active:scale-[0.99] transition-all font-display mt-2 disabled:opacity-50"
        >
          {pushTestStatus && pushTestStatus !== 'Sending...' ? pushTestStatus : (pushTestStatus === 'Sending...' ? 'Sending...' : 'Send Real Push to All Devices')}
        </button>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[#111] font-display mb-4">How It Works</h3>
        <div className="space-y-4">
          {[
            {
              emoji: '1️⃣',
              title: 'Scheduled Delivery',
              desc: 'Key points for the current week\'s topics are delivered every 2 hours via push notification to students\' devices.',
            },
            {
              emoji: '2️⃣',
              title: 'Smart Cycling',
              desc: 'Each point is shown up to 3 times before cycling to the next. After all points have been seen, the cycle resets. Repetition reinforces learning.',
            },
            {
              emoji: '3️⃣',
              title: 'Patches Mode',
              desc: 'When users activate Patches on Feb 14, notifications switch to only show key points from subjects where they scored below 50%. Laser-focused on weak areas.',
            },
            {
              emoji: '4️⃣',
              title: 'Week-Based Content',
              desc: 'Content automatically updates when the week changes. No manual intervention needed — old notifications stop, new ones begin for the new week.',
            },
            {
              emoji: '5️⃣',
              title: 'In-App + Push',
              desc: 'When the app is open, a pop-in card appears. When closed, a native push notification delivers the key point. Both work together.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="text-lg shrink-0">{item.emoji}</span>
              <div>
                <p className="text-xs font-bold text-[#111] font-label">{item.title}</p>
                <p className="text-[11px] text-[#888] font-label leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[#111] font-display mb-3">Send Broadcast</h3>
        <p className="text-xs text-[#888] font-label mb-4">
          Send a custom push notification to all users. They will see it as an in-app popup and a phone notification.
        </p>
        <input
          value={broadcastTitle}
          onChange={(e) => setBroadcastTitle(e.target.value)}
          placeholder="Notification title..."
          className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm font-label text-[#111] placeholder-[#BBB] outline-none focus:border-[#111] transition-colors mb-3"
        />
        <textarea
          value={broadcastMessage}
          onChange={(e) => setBroadcastMessage(e.target.value)}
          placeholder="Write your message here..."
          rows={3}
          className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-4 py-2.5 text-sm font-label text-[#111] placeholder-[#BBB] outline-none focus:border-[#111] transition-colors resize-none mb-3"
        />
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-[#888] font-label mb-1.5">Target audience</p>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All Users' },
              { value: 'paid', label: 'Paid Only' },
              { value: 'unpaid', label: 'Non-Paid' },
            ].map((opt) => (
              <button key={opt.value} onClick={() => setBroadcastTarget(opt.value)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold font-label border transition-colors ${
                  broadcastTarget === opt.value
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white text-[#888] border-[#E5E5E5] hover:border-[#CCC]'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleSendBroadcast}
          disabled={!broadcastTitle.trim() || !broadcastMessage.trim() || broadcastStatus === 'Sending...'}
          className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {broadcastStatus || (broadcastTarget === 'all' ? 'Send to All Users' : broadcastTarget === 'paid' ? 'Send to Paid Users Only' : 'Send to Non-Paid Users')}
        </button>
      </div>

      <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-red-800 font-display mb-2">Danger Zone</h3>
        <p className="text-xs text-red-600 font-label mb-4">
          Disabling notifications will stop ALL scheduled deliveries immediately. Users will not
          receive any more key points until re-enabled.
        </p>
        {enabled && (
          <button
            onClick={() => {
              if (confirm('Are you sure? This stops all notifications for all users.')) {
                disable(adminName)
                saveAdminNotificationStateToFirestore(false)
              }
            }}
            className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-red-700 active:scale-[0.99] transition-all font-display"
          >
            ⚠️ Emergency Stop — Disable All Notifications
          </button>
        )}
      </div>
    </div>
  )
}

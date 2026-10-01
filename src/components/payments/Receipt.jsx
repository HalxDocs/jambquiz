import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Copy01Icon, Share01Icon } from '@hugeicons/core-free-icons'
import { useToastStore } from '../../store/toast'

export function receiptTitle(payment) {
  const t = payment?.type || ''
  if (t === 'coin_purchase' || t === 'coins') return `+${payment?.coins || 0} Coins`
  if (t === 'account_resume' || t === 'resume') return 'Account Reactivation'
  return 'Subscription — 1 Month'
}

export function receiptEffectLine(payment) {
  const t = payment?.type || ''
  if ((t === 'coin_purchase' || t === 'coins') && payment?.coins) {
    return `${Number(payment.coins).toLocaleString()} coins added to wallet`
  }
  if (payment?.extendsTo) {
    try {
      return `Active until ${new Date(payment.extendsTo).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`
    } catch { return '' }
  }
  if (t === 'account_resume' || t === 'resume') return 'Account reactivated'
  return ''
}

export function formatReceiptText(payment, brand = '274Lab') {
  const lines = [
    `${brand} — PAYMENT RECEIPT (PAID)`,
    `Item: ${receiptTitle(payment)}`,
  ]
  const effect = receiptEffectLine(payment)
  if (effect) lines.push(`Effect: ${effect}`)
  lines.push(`Amount: ₦${Number(payment?.amount || 0).toLocaleString()}${payment?.currency && payment.currency !== 'NGN' ? ` ${payment.currency}` : ''}`)
  if (payment?.studentName) lines.push(`Buyer: ${payment.studentName}`)
  if (payment?.email) lines.push(`Receipt email: ${payment.email}`)
  if (payment?.reference) lines.push(`Reference: ${payment.reference}`)
  if (payment?.paidAt) {
    try { lines.push(`Date: ${new Date(payment.paidAt).toLocaleString('en-NG')}`) } catch {}
  }
  lines.push(`Method: ${(payment?.method || 'paystack').toUpperCase()}`)
  lines.push('Questions? Reach us via the Contact page or contact@274lab.com.')
  return lines.join('\n')
}

export async function shareReceipt(payment, brand = '274Lab') {
  const text = formatReceiptText(payment, brand)
  try {
    if (navigator.share) {
      await navigator.share({ title: `${brand} receipt`, text })
      return true
    }
  } catch { return false }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      useToastStore.getState().showToast('Receipt copied — paste it anywhere!', 'success')
      return true
    }
  } catch {}
  useToastStore.getState().showToast('Copy this receipt manually', 'info')
  return false
}

export default function Receipt({ payment = {}, emailSentTo, footerNote, onDone, doneLabel = 'Done ✓' }) {
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const effect = receiptEffectLine(payment)

  const copyRef = async () => {
    try {
      if (navigator.clipboard?.writeText && payment?.reference) {
        await navigator.clipboard.writeText(payment.reference)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  const handleShare = async () => {
    setSharing(true)
    await shareReceipt(payment)
    setSharing(false)
  }

  const handlePrint = () => {
    try { window.print() } catch {}
  }

  return (
    <div className="w-full max-w-sm bg-white border border-[#EBEBEB] rounded-2xl overflow-hidden">
      {/* Brand header */}
      <div className="bg-[#111] text-white px-5 pt-5 pb-4 text-center">
        <p className="text-[10px] font-semibold tracking-[0.25em] uppercase font-label text-[#888]">274Lab</p>
        <h2 className="text-lg font-bold font-display mt-0.5">Payment Receipt</h2>
        <span className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-bold bg-green-400/15 text-green-300 border border-green-400/20 px-3 py-1 rounded-full font-label">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} color="#86EFAC" /> PAID
        </span>
      </div>

      <div className="px-5 py-4">
        {/* Item hero */}
        <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl px-4 py-3 text-center mb-3">
          <p className="text-base font-bold text-[#111] font-display">{receiptTitle(payment)}</p>
          <p className="text-2xl font-bold text-[#111] font-display mt-0.5">₦{Number(payment?.amount || 0).toLocaleString()}</p>
          {effect && <p className="text-[11px] text-green-700 font-bold font-label mt-1">{effect}</p>}
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-[#F3F3F2] text-xs font-label">
          {payment?.studentName && (
            <div className="flex justify-between py-2">
              <span className="text-[#AAA]">Buyer</span>
              <span className="text-[#111] font-bold text-right truncate ml-3">{payment.studentName}</span>
            </div>
          )}
          <div className="flex justify-between py-2">
            <span className="text-[#AAA]">Item</span>
            <span className="text-[#111] font-bold text-right ml-3">{receiptTitle(payment)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#AAA]">Method</span>
            <span className="text-[#111] font-bold uppercase">{payment?.method || 'paystack'}</span>
          </div>
          <div className="flex justify-between py-2 gap-2">
            <span className="text-[#AAA] shrink-0">Reference</span>
            <button onClick={copyRef} title="Copy reference"
              className="inline-flex items-center gap-1 text-[#111] font-mono text-[11px] truncate">
              <span className="truncate">{payment?.reference || '—'}</span>
              <HugeiconsIcon icon={Copy01Icon} size={13} color={copied ? '#15803D' : '#AAA'} />
            </button>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#AAA]">Date</span>
            <span className="text-[#111] font-bold text-right ml-3">
              {payment?.paidAt ? (() => { try { return new Date(payment.paidAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '—' } })() : '—'}
            </span>
          </div>
          {(emailSentTo || payment?.email) && (
            <div className="flex justify-between py-2">
              <span className="text-[#AAA]">Receipt email</span>
              <span className="text-[#111] font-bold text-right truncate ml-3">{emailSentTo || payment.email}</span>
            </div>
          )}
        </div>

        {!(emailSentTo || payment?.email) && (
          <p className="text-[11px] text-[#AAA] font-label mt-2 text-center">
            No email on file — add one in your profile so Paystack can email future receipts.
          </p>
        )}
        {footerNote && (
          <p className="text-[11px] text-[#888] font-label mt-2 text-center">{footerNote}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button onClick={handleShare} disabled={sharing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[#E5E5E5] text-[#333] rounded-xl py-3 text-xs font-bold font-label hover:bg-[#F8F8F7] transition-colors disabled:opacity-50">
            <HugeiconsIcon icon={Share01Icon} size={15} color="currentColor" />
            {sharing ? 'Sharing…' : 'Share'}
          </button>
          <button onClick={handlePrint}
            className="flex-1 border border-[#E5E5E5] text-[#333] rounded-xl py-3 text-xs font-bold font-label hover:bg-[#F8F8F7] transition-colors">
            Print / PDF
          </button>
        </div>
        {onDone && (
          <button onClick={onDone}
            className="w-full mt-2 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.99] transition-all">
            {doneLabel}
          </button>
        )}
        <p className="text-[10px] text-[#CCC] text-center mt-3 font-label">Questions? Contact page or contact@274lab.com</p>
      </div>
    </div>
  )
}

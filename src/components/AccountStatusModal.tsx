import React, { useState } from 'react';
import {
  AlertTriangle,
  Lock,
  LogOut,
  MessageSquare,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { UserAccount } from '../types/finance';

interface AccountHoldPopupProps {
  user: UserAccount;
  isOpen: boolean;
  onAcknowledgeOkay: (optionalMessage: string) => void;
}

/**
 * Shown whenever an On-Hold user logs in or refreshes the page.
 * Displays the hold notice, Admin's reason/messages, a non-mandatory message box,
 * and ONLY an "Okay" button.
 */
export const AccountHoldPopup: React.FC<AccountHoldPopupProps> = ({
  user,
  isOpen,
  onAcknowledgeOkay,
}) => {
  const [messageText, setMessageText] = useState('');

  if (!isOpen) return null;

  const messages = user.supportMessages || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAcknowledgeOkay(messageText.trim());
    setMessageText('');
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-hold-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border-2 border-amber-500 shadow-2xl overflow-hidden animate-fade-up"
      >
        <div className="px-6 py-4 bg-amber-500 text-slate-950 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <h2 id="account-hold-title" className="text-base font-extrabold">
              Your Account is on Hold
            </h2>
            <p className="text-xs font-semibold text-slate-900">
              Read-Only View Mode · Contact Admin to check issue and reason
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            Your account (<strong>@{user.username}</strong>) is currently placed on hold by the
            Administrator. Contact Admin to check the issue and reason. While on hold, you can view
            your saved records and change your password in Settings, but all saving, editing, and
            PDF/Excel export options are disabled.
          </p>

          {user.holdReason && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-extrabold text-[11px] uppercase tracking-wider">
                Admin Reason / Notice:
              </div>
              <p className="font-semibold">{user.holdReason}</p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500">
                Admin Support Messages ({messages.length})
              </div>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-lg text-xs ${
                    m.sender === 'admin'
                      ? 'bg-rose-500/10 border border-rose-500/30 text-slate-900 dark:text-slate-100'
                      : 'bg-emerald-500/10 border border-emerald-500/30 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold opacity-75 mb-0.5">
                    <span>{m.sender === 'admin' ? 'Admin Support' : `You (@${user.username})`}</span>
                    <span>{m.createdAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label
              htmlFor="hold-optional-message"
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              If you have any message for Admin, type below (Optional / Non-Mandatory):
            </label>
            <textarea
              id="hold-optional-message"
              rows={3}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type a message or question for Admin (optional)..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* ONLY an Okay button as requested */}
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm transition-colors cursor-pointer shadow-md"
          >
            Okay
          </button>
        </div>
      </form>
    </div>
  );
};

interface AccountDisabledGateProps {
  user: UserAccount;
  onSendMessageToAdmin: (message: string) => void;
  onLogout: () => void;
}

/**
 * Shown when Admin sets a user's status to 'disabled'.
 * The user cannot view any previous financial data—only this popup and the simple Admin Support Chat window.
 */
export const AccountDisabledGate: React.FC<AccountDisabledGateProps> = ({
  user,
  onSendMessageToAdmin,
  onLogout,
}) => {
  const [chatInput, setChatInput] = useState('');
  const messages = user.supportMessages || [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessageToAdmin(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border-2 border-rose-500/50 shadow-2xl overflow-hidden animate-fade-up">
        <div className="px-6 py-5 bg-rose-600 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <h1 className="text-base font-extrabold">Account Disabled by Administrator</h1>
              <p className="text-xs text-rose-100">
                @{user.username} ({user.displayName}) · Dashboard Access Restricted
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg bg-white text-rose-700 font-bold text-xs hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Off
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Your account has been disabled by the Administrator.</div>
              <p className="mt-0.5">
                Access to your previous dashboard and saved records is turned off while your account
                is disabled. Use the Admin Support Chat below to contact the Administrator.
              </p>
              {user.holdReason && (
                <p className="mt-2 font-bold">Admin Reason: &ldquo;{user.holdReason}&rdquo;</p>
              )}
            </div>
          </div>

          {/* Simple Admin Support Chat Box */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                Admin Support Chat
              </span>
              <span className="text-[11px] text-slate-500">Direct message to Admin</span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">
                  No messages yet. Type below to message the Admin regarding your account.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-lg ${
                      m.sender === 'admin'
                        ? 'bg-rose-500/10 border border-rose-500/30'
                        : 'bg-emerald-500/10 border border-emerald-500/30 ml-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>{m.sender === 'admin' ? 'Admin Support' : `You (@${user.username})`}</span>
                      <span>{m.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div className="text-slate-900 dark:text-slate-100">{m.text}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSend} className="flex gap-2 pt-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Write a message to Admin Support..."
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

interface UserSupportChatModalProps {
  user: UserAccount;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => void;
  onChangePasswordHere?: () => void;
}

/**
 * Simple, compact Admin Support Chat & Security Alert popup for logged-in users.
 */
export const UserSupportChatModal: React.FC<UserSupportChatModalProps> = ({
  user,
  isOpen,
  onClose,
  onSendMessage,
  onChangePasswordHere,
}) => {
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const messages = user.supportMessages || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-chat-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-fade-up">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 id="support-chat-modal-title" className="text-sm font-bold">
              Admin Support &amp; Security Chat
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Admin Support Chat"
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {user.supportIssueClosedAt && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <span>
                <strong>Issue Closed by Admin:</strong> Your support issue has been resolved. This chat history will automatically clear 24 hours after closure.
              </span>
            </div>
          )}

          {user.holdReason && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
              <span className="font-bold">Admin Reason / Notice:</span> {user.holdReason}
            </div>
          )}

          <div className="space-y-2.5 max-h-64 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            {messages.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                No support messages yet. Send a message below to contact the Administrator.
              </div>
            ) : (
              messages.map((m) => {
                const isSecurityAlert = m.messageType === 'security_login_alert';
                return (
                  <div
                    key={m.id}
                    data-testid={isSecurityAlert ? 'chat-security-login-alert' : undefined}
                    className={`p-3 rounded-xl ${
                      isSecurityAlert
                        ? 'bg-rose-500/15 border-2 border-rose-500 text-slate-900 dark:text-slate-100'
                        : m.sender === 'admin'
                        ? 'bg-rose-500/10 border border-rose-500/30'
                        : 'bg-emerald-500/10 border border-emerald-500/30 ml-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      <span className={isSecurityAlert ? 'text-rose-600 dark:text-rose-400 font-extrabold uppercase' : ''}>
                        {isSecurityAlert
                          ? '🔒 Security Login Alert (Auto-deletes in 24h)'
                          : m.sender === 'admin'
                          ? 'Admin Support'
                          : `You (@${user.username})`}
                      </span>
                      <span>{m.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
                      {m.text}
                    </div>
                    {isSecurityAlert && onChangePasswordHere && (
                      <div className="mt-2.5 pt-2 border-t border-rose-500/30 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onChangePasswordHere();
                          }}
                          data-testid="chat-change-password-immediately-btn"
                          className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Change Password Immediately Here
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your message to Admin..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

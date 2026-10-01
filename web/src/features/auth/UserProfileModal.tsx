import { useDialogFocus } from '../../hooks/useDialogFocus';
import React, { useState, useRef } from 'react';
import type { UserProfile, UpdateProfilePayload } from '../../services/auth';
import { authService } from '../../services/auth';

interface UserProfileModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (user: UserProfile) => void;
}

const PRESET_BG_COLORS = [
  { label: '麦芽金 (默认)', value: '#f5d8a8', text: '#744210' },
  { label: '冰川蓝', value: '#dbeafe', text: '#1e40af' },
  { label: '薄荷绿', value: '#dcfce7', text: '#166534' },
  { label: '樱花粉', value: '#fce7f3', text: '#9d174d' },
  { label: '薰衣紫', value: '#ede9fe', text: '#5b21b6' },
  { label: '暖日橙', value: '#ffedd5', text: '#9a3412' },
  { label: '天青碧', value: '#ccfbf1', text: '#115e59' },
  { label: '极简灰', value: '#f1f5f9', text: '#334155' },
];

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'avatar' | 'security'>('profile');
  const [name, setName] = useState(user.name || '');
  const [team, setTeam] = useState(user.team || '');

  // Avatar states
  const [avatarType, setAvatarType] = useState<'badge' | 'image'>(user.avatar ? 'image' : 'badge');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || '');
  const [avatarLetter, setAvatarLetter] = useState(
    user.avatar_letter || (user.name ? user.name.charAt(0).toUpperCase() : 'B'),
  );
  const [avatarBg, setAvatarBg] = useState(user.avatar_bg || '#f5d8a8');

  // Security password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose, saving || uploading);
  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrorMsg('请选择不超过 2MB 的 PNG 或 JPG 图片');
      return;
    }

    try {
      setUploading(true);
      setErrorMsg('');

      const uploadedUrl = await authService.uploadAvatar(file);
      setAvatarUrl(uploadedUrl);
      setAvatarType('image');
    } catch (err: unknown) {
      setErrorMsg((err instanceof Error ? err.message : '') || '头像上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('姓名或企业名称不能为空');
      return;
    }

    if (newPassword) {
      if (
        new TextEncoder().encode(newPassword).length < 12 ||
        new TextEncoder().encode(newPassword).length > 72
      ) {
        setErrorMsg('新密码需要 12 至 72 字节');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('两次输入的新密码不一致');
        return;
      }
      if (!currentPassword) {
        setErrorMsg('修改密码时必须输入当前原密码');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: UpdateProfilePayload = {
        name: name.trim(),
        team: team.trim(),
        avatar: avatarType === 'image' ? avatarUrl.trim() : '',
        avatar_bg: avatarBg,
        avatar_letter: avatarLetter.trim() || (name ? name.charAt(0).toUpperCase() : 'B'),
      };

      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const updated = await authService.updateProfile(payload);
      onUpdated(updated);
      setSuccessMsg('资料更新成功！');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg((err instanceof Error ? err.message : '') || '保存资料失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const selectedBgMeta = PRESET_BG_COLORS.find((c) => c.value === avatarBg) || { text: '#744210' };

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="个人资料与安全设置"
      tabIndex={-1}
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="modal-panel"
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 22px',
            borderBottom: '1px solid #f1f5f9',
            background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                color: '#1e293b',
              }}
            >
              用户资料与账号设置
            </h3>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: '12px',
                color: '#64748b',
              }}
            >
              自定义您的品牌用户名、角色团队及专属个性化头像
            </p>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#fff',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Live Preview Card */}
        <div
          style={{
            padding: '16px 22px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Avatar Preview */}
          <div style={{ position: 'relative' }}>
            {avatarType === 'image' && avatarUrl ? (
              <img
                src={avatarUrl}
                alt="头像预览"
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '14px',
                  objectFit: 'cover',
                  border: '2px solid #ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '14px',
                  backgroundColor: avatarBg,
                  color: selectedBgMeta.text,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '22px',
                  fontWeight: 800,
                  border: '2px solid #ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
              >
                {avatarLetter || (name ? name.charAt(0).toUpperCase() : 'B')}
              </div>
            )}
            <span
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                border: '2px solid #fff',
              }}
            />
          </div>

          {/* User Info Details */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <b style={{ fontSize: '15px', color: '#1e293b' }}>{name || '未设置用户名'}</b>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#eef2ff',
                  color: '#4338ca',
                  fontWeight: 600,
                }}
              >
                {user.role}
              </span>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                marginTop: '4px',
              }}
            >
              {team || '增长团队'} · {user.email}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #f1f5f9',
            padding: '0 22px',
            background: '#fff',
          }}
        >
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '12px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'profile' ? 700 : 500,
              color: activeTab === 'profile' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'profile' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            个人资料
          </button>
          <button
            onClick={() => setActiveTab('avatar')}
            style={{
              padding: '12px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'avatar' ? 700 : 500,
              color: activeTab === 'avatar' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'avatar' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            自定义头像
          </button>
          <button
            onClick={() => setActiveTab('security')}
            style={{
              padding: '12px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'security' ? 700 : 500,
              color: activeTab === 'security' ? '#2563eb' : '#64748b',
              borderBottom:
                activeTab === 'security' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            安全与密码
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div
            style={{
              margin: '12px 22px 0',
              padding: '8px 12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            style={{
              margin: '12px 22px 0',
              padding: '8px 12px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Modal Body Form */}
        <form onSubmit={handleSave} style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {/* TAB 1: Profile */}
          {activeTab === 'profile' && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label
                  htmlFor="userprofilemodal-field-1"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  用户名 / 品牌名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="userprofilemodal-field-1"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：Bgeo 或 管理员"
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                  required
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginTop: '4px',
                    display: 'block',
                  }}
                >
                  展示在左侧边栏底部和顶部导航栏的用户标识
                </span>
              </div>

              <div>
                <label
                  htmlFor="userprofilemodal-field-2"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  所属团队 / 业务部门
                </label>
                <input
                  id="userprofilemodal-field-2"
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="例如：增长团队、策略组"
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="userprofilemodal-field-3"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  登录账号邮箱
                </label>
                <input
                  id="userprofilemodal-field-3"
                  type="email"
                  value={user.email}
                  disabled
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    color: '#64748b',
                    fontSize: '13px',
                    cursor: 'not-allowed',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginTop: '4px',
                    display: 'block',
                  }}
                >
                  企业主认证邮箱不可直接修改
                </span>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  平台授权权限
                </label>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>
                    角色：<b>{user.role}</b>
                    （实际操作权限由当前项目成员角色决定）
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Avatar Customization */}
          {activeTab === 'avatar' && (
            <div style={{ display: 'grid', gap: '18px' }}>
              {/* Avatar Type Selector */}
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  background: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '9px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setAvatarType('badge')}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    fontSize: '12px',
                    fontWeight: avatarType === 'badge' ? 700 : 500,
                    borderRadius: '7px',
                    border: 'none',
                    background: avatarType === 'badge' ? '#fff' : 'transparent',
                    color: avatarType === 'badge' ? '#0f172a' : '#64748b',
                    boxShadow: avatarType === 'badge' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  🅰️ 极简字母徽章 (原型风格)
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarType('image')}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    fontSize: '12px',
                    fontWeight: avatarType === 'image' ? 700 : 500,
                    borderRadius: '7px',
                    border: 'none',
                    background: avatarType === 'image' ? '#fff' : 'transparent',
                    color: avatarType === 'image' ? '#0f172a' : '#64748b',
                    boxShadow: avatarType === 'image' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  🖼️ 自定义图片头像
                </button>
              </div>

              {/* Mode A: Badge Customization */}
              {avatarType === 'badge' && (
                <div style={{ display: 'grid', gap: '14px' }}>
                  <div>
                    <label
                      htmlFor="userprofilemodal-field-4"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: '6px',
                      }}
                    >
                      徽章字符 (1~2个字)
                    </label>
                    <input
                      id="userprofilemodal-field-4"
                      type="text"
                      maxLength={2}
                      value={avatarLetter}
                      onChange={(e) => setAvatarLetter(e.target.value)}
                      placeholder="B"
                      style={{
                        width: '80px',
                        textAlign: 'center',
                        padding: '8px',
                        fontSize: '16px',
                        fontWeight: 800,
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: '8px',
                      }}
                    >
                      选择徽章温润底色 (Daylight 柔和色系)
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '8px',
                      }}
                    >
                      {PRESET_BG_COLORS.map((col) => (
                        <button
                          key={col.value}
                          type="button"
                          onClick={() => setAvatarBg(col.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            border:
                              avatarBg === col.value ? '2px solid #2563eb' : '1px solid #e2e8f0',
                            backgroundColor: col.value,
                            color: col.text,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: col.text,
                              display: 'inline-block',
                            }}
                          />
                          {col.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mode B: Image Upload & Preset */}
              {avatarType === 'image' && (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {/* Upload button */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: '6px',
                      }}
                    >
                      上传本地照片 / 图标
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept="image/png,image/jpeg"
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="btn small"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        {uploading ? '上传中...' : '选择本地图片'}
                      </button>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}
                      >
                        支持 JPG、PNG，最大 2MB（建议正方形）
                      </span>
                    </div>
                  </div>

                  {/* Preset Avatars */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: '6px',
                      }}
                    >
                      或选择精选商务与极客头像
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {PRESET_AVATARS.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`preset ${idx}`}
                          onClick={() => setAvatarUrl(url)}
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                            cursor: 'pointer',
                            border:
                              avatarUrl === url ? '2px solid #2563eb' : '2px solid transparent',
                            boxShadow: avatarUrl === url ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Direct URL input */}
                  <div>
                    <label
                      htmlFor="userprofilemodal-field-5"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: '6px',
                      }}
                    >
                      直接输入图片链接 (URL)
                    </label>
                    <input
                      id="userprofilemodal-field-5"
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                      className="input"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Security & Password */}
          {activeTab === 'security' && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #dbeafe',
                  fontSize: '12px',
                  color: '#1e40af',
                }}
              >
                ℹ️ 若不需要修改密码，请保持下列字段留空即可。
              </div>

              <div>
                <label
                  htmlFor="userprofilemodal-field-6"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  当前原密码
                </label>
                <input
                  id="userprofilemodal-field-6"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="修改密码需先验证原密码"
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="userprofilemodal-field-7"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  新密码
                </label>
                <input
                  id="userprofilemodal-field-7"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="不少于 6 位密码"
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="userprofilemodal-field-8"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  确认新密码
                </label>
                <input
                  id="userprofilemodal-field-8"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn ghost"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn primary"
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {saving && (
                <svg
                  style={{
                    animation: 'spin 1s linear infinite',
                    width: '14px',
                    height: '14px',
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    opacity="0.25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

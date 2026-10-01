export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  team?: string;
  avatar?: string;
  avatar_bg?: string;
  avatar_letter?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  team?: string;
  avatar?: string;
  avatar_bg?: string;
  avatar_letter?: string;
  current_password?: string;
  new_password?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

const ACCESS_TOKEN_KEY = 'geopilot_access_token';
let generation = 0;
let refreshInFlight: Promise<string> | null = null;
const USER_KEY = 'geopilot_user';

type AuthListener = (user: UserProfile | null) => void;
const listeners = new Set<AuthListener>();

export const authService = {
  getGeneration: () => generation,
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  },

  getUser(): UserProfile | null {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },

  setSession(tokens: { access_token: string; refresh_token?: string }, user?: UserProfile) {
    generation++;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);

    if (user) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    this.notify(this.getUser());
  },

  clearSession() {
    generation++;
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem('geopilot_refresh_token');
    sessionStorage.removeItem('bgeo_project_id');
    sessionStorage.removeItem(USER_KEY);
    this.notify(null);
  },

  subscribe(listener: AuthListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  notify(user: UserProfile | null) {
    listeners.forEach((fn) => fn(user));
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '登录失败，请检查账号密码');
    }

    const data: LoginResponse = await res.json();
    this.setSession(data, data.user);
    return data;
  },

  async refreshToken(): Promise<string> {
    if (refreshInFlight) return refreshInFlight;
    const version = generation;
    refreshInFlight = (async () => {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 401 && generation === version) this.clearSession();
        throw new Error('刷新登录失败，请重新登录');
      }
      const data: RefreshResponse = await res.json();
      if (generation !== version) throw new Error('会话已变更，请重新登录');
      sessionStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      return data.access_token;
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  },

  async logout(): Promise<void> {
    const accessToken = this.getAccessToken();
    try {
      if (accessToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      this.clearSession();
    }
  },

  async fetchCurrentUser(): Promise<UserProfile> {
    const accessToken = this.getAccessToken();
    let res = await fetch('/api/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.status === 401) {
      const token = await this.refreshToken();
      res = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (!res.ok) {
      throw new Error('Failed to fetch user profile');
    }
    const user: UserProfile = await res.json();
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    this.notify(user);
    return user;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    const accessToken = this.getAccessToken();
    const res = await fetch('/api/v1/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '更新个人资料失败');
    }

    const updated: UserProfile = await res.json();
    if (payload.new_password) {
      this.clearSession();
      return updated;
    }
    sessionStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.notify(updated);
    return updated;
  },

  async uploadAvatar(file: File): Promise<string> {
    const accessToken = this.getAccessToken();
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('/api/v1/auth/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '上传头像文件失败');
    }

    const data = await res.json();
    return data.avatar_url;
  },
};

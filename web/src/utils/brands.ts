export type BrandName =
  | 'chatgpt'
  | 'openai'
  | 'deepseek'
  | 'doubao'
  | 'perplexity'
  | 'kimi'
  | 'moonshot'
  | 'claude'
  | 'anthropic'
  | 'qwen'
  | 'gemini'
  | string;

export interface BrandMeta {
  key: string;
  displayName: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
}

export function normalizeBrandKey(name: string): string {
  const n = (name || '').trim().toLowerCase();
  if (
    n === 'c' ||
    n.includes('chatgpt') ||
    n.includes('openai') ||
    n === 'gpt' ||
    n.includes('gpt-4')
  ) {
    return 'chatgpt';
  }
  if (n === 'ds' || n.includes('deepseek')) {
    return 'deepseek';
  }
  if (n === '豆' || n.includes('doubao') || n.includes('豆包')) {
    return 'doubao';
  }
  if (n === 'p' || n.includes('perplexity')) {
    return 'perplexity';
  }
  if (n === 'k' || n.includes('kimi') || n.includes('moonshot') || n.includes('月之暗面')) {
    return 'kimi';
  }
  if (n.includes('claude') || n.includes('anthropic')) {
    return 'claude';
  }
  if (n.includes('qwen') || n.includes('通义') || n.includes('千问') || n.includes('ali')) {
    return 'qwen';
  }
  if (n.includes('gemini') || n.includes('google')) {
    return 'gemini';
  }
  return n;
}

export function getBrandMeta(name: string): BrandMeta {
  const key = normalizeBrandKey(name);
  switch (key) {
    case 'chatgpt':
      return {
        key: 'chatgpt',
        displayName: 'ChatGPT',
        bgColor: '#10a37f',
        textColor: '#ffffff',
        accentColor: '#10a37f',
      };
    case 'deepseek':
      return {
        key: 'deepseek',
        displayName: 'DeepSeek',
        bgColor: '#1e50ff',
        textColor: '#ffffff',
        accentColor: '#1e50ff',
      };
    case 'doubao':
      return {
        key: 'doubao',
        displayName: '豆包',
        bgColor: '#1e37fc',
        textColor: '#ffffff',
        accentColor: '#1e37fc',
      };
    case 'perplexity':
      return {
        key: 'perplexity',
        displayName: 'Perplexity',
        bgColor: '#20808d',
        textColor: '#ffffff',
        accentColor: '#20808d',
      };
    case 'kimi':
      return {
        key: 'kimi',
        displayName: 'Kimi',
        bgColor: '#1f242d',
        textColor: '#ffffff',
        accentColor: '#027aff',
      };
    case 'claude':
      return {
        key: 'claude',
        displayName: 'Claude',
        bgColor: '#cc785c',
        textColor: '#ffffff',
        accentColor: '#cc785c',
      };
    case 'qwen':
      return {
        key: 'qwen',
        displayName: '通义千问',
        bgColor: '#665cee',
        textColor: '#ffffff',
        accentColor: '#665cee',
      };
    case 'gemini':
      return {
        key: 'gemini',
        displayName: 'Gemini',
        bgColor: '#1e293b',
        textColor: '#ffffff',
        accentColor: '#8e75b2',
      };
    default:
      return {
        key,
        displayName: name,
        bgColor: '#334155',
        textColor: '#ffffff',
        accentColor: '#64748b',
      };
  }
}

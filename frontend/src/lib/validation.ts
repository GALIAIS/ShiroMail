const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mailboxLocalPartPattern = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function isBlank(value: string | null | undefined) {
  return normalizeText(value).length === 0;
}

export function validateRequiredText(
  label: string,
  value: string | null | undefined,
  options?: {
    minLength?: number;
    maxLength?: number;
  },
) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `${label}不能为空。`;
  }
  if (options?.minLength && normalized.length < options.minLength) {
    return `${label}至少需要 ${options.minLength} 个字符。`;
  }
  if (options?.maxLength && normalized.length > options.maxLength) {
    return `${label}不能超过 ${options.maxLength} 个字符。`;
  }
  return null;
}

export function validateEmailAddress(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "邮箱地址不能为空。";
  }
  if (!emailPattern.test(normalized)) {
    return "邮箱地址格式不正确。";
  }
  return null;
}

export function validateHTTPUrl(value: string | null | undefined, label = "回调地址") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `${label}不能为空。`;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${label}必须使用 http:// 或 https://。`;
    }
    return null;
  } catch {
    return `${label}格式不正确。`;
  }
}

export function validateHTTPOrRootUrl(value: string | null | undefined, label = "链接地址") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `${label}不能为空。`;
  }
  if (normalized.startsWith("/")) {
    return null;
  }
  return validateHTTPUrl(normalized, label);
}

export function validateImageSourceUrl(value: string | null | undefined, label = "图片地址") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `${label}不能为空。`;
  }
  if (normalized.startsWith("/")) {
    return null;
  }
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(normalized)) {
    return null;
  }
  return validateHTTPUrl(normalized, label);
}

export function normalizeCommaSeparatedList(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function validateSelection(label: string, value: string | null | undefined, allowedValues?: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `请选择${label}。`;
  }
  if (allowedValues && !allowedValues.includes(normalized)) {
    return `${label}无效，请重新选择。`;
  }
  return null;
}

export function validateMailboxLocalPart(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!mailboxLocalPartPattern.test(normalized)) {
    return "邮箱前缀仅支持 2-64 位小写字母、数字、点、下划线或短横线，且必须以字母或数字开头。";
  }
  return null;
}

export function validateOneTimeCode(value: string | null | undefined, label = "验证码") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return `${label}不能为空。`;
  }
  if (!/^\d{6}$/.test(normalized)) {
    return `${label}必须是 6 位数字。`;
  }
  return null;
}

export function validateIntegerRange(
  label: string,
  value: number,
  options: {
    min: number;
    max: number;
  },
) {
  if (!Number.isInteger(value)) {
    return `${label}必须是整数。`;
  }
  if (value < options.min || value > options.max) {
    return `${label}必须在 ${options.min} 到 ${options.max} 之间。`;
  }
  return null;
}

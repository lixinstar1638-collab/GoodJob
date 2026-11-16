/**
 * 实体查重键（3.3.1 发布时漏提交，本文件为按 3.0.1 原实现与调用口径重建）。
 *
 * 归一化「公司名 + 国家」重复判定键：去首尾空格、压平空白、统一小写。
 * server-core.ts 的 findDuplicateLead 与「仅本人」查重共用同一口径，
 * 实现只放这一处，避免两边漂移。
 */
export function entityDuplicateKey(company: string, country: string) {
  const normalize = (value: string) => value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
  return `${normalize(company)}|${normalize(country)}`;
}

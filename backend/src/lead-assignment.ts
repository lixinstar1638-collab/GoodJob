/**
 * 线索指派（3.3.1 发布时漏提交，本文件按 routes/leads.ts 调用点、
 * 前端 modules/leads.ts 的同名口径与 Lead 类型上的指派字段重建）。
 *
 * 业务口径：
 * - 能否指派：`lead.assign` 权限码。legacy 角色只有 manager / admin 有
 *   （见 iam/iam-foundation.ts 的 managerExtraPermissions），IAM 走能力快照。
 * - 「上级」口径（isSupervisorAssigner）：legacy admin / manager，或 IAM
 *   授权范围不是 self —— 可指派本团队任意线索。
 * - 非上级但有指派权限的账号：只能指派进入自己账号的线索（ownerId 是自己），
 *   或改派自己指派出去的线索（assignedBy 是自己）。
 * - 指派只保留「最近一次」信息在线索上（assignedBy / assignedAt /
 *   assignmentFrom / assignmentNote），完整历史由路由写 leadActivities 留痕。
 */
import { hasIamPermission } from "./auth.js";
import { type Lead, type SessionUser, type User } from "./types.js";

/** 当前账号能否指派线索（与前端 canAssignLeads 同口径）。 */
export function canAssignLeads(user: SessionUser | undefined) {
  return hasIamPermission(user, "lead.assign");
}

/** 是否属于「上级」口径：能指派本团队任意线索。 */
export function isSupervisorAssigner(user: SessionUser | undefined) {
  if (!user || !canAssignLeads(user)) return false;
  const scopes = user.iamPermissions?.["lead.assign"];
  if (scopes?.length) return scopes.some((scope) => scope !== "self");
  return user.role === "admin" || user.role === "manager";
}

/** 当前账号能否指派这一条线索。 */
export function canAssignLead(user: SessionUser | undefined, lead: Lead) {
  if (!user || !canAssignLeads(user)) return false;
  if (lead.teamId !== user.teamId) return false;
  if (isSupervisorAssigner(user)) return true;
  return lead.ownerId === user.id || lead.assignedBy === user.id;
}

/**
 * 可指派的接收人名单：本团队、在职、非平台管理员。
 * 不含当前账号本人——前端弹窗会单独追加「我自己 · 收回名下」选项。
 */
export function assignableMembersFor(users: User[], user: SessionUser) {
  return users
    .filter((item) =>
      item.id !== user.id
      && item.teamId === user.teamId
      && item.status === "active"
      && item.role !== "super_admin"
    )
    .map((item) => ({ id: item.id, name: item.name, role: item.role }));
}

/**
 * 执行一次指派：改归属并写入「最近一次」指派信息。
 * 负责人没变时返回 changed=false，由路由决定不写留痕、不落库。
 */
export function applyLeadAssignment(input: {
  lead: Lead;
  toOwnerId: string;
  actorId: string;
  note: string;
  now: string;
}) {
  const { lead, toOwnerId, actorId, note, now } = input;
  if (lead.ownerId === toOwnerId) {
    return { changed: false, previousOwnerId: lead.ownerId };
  }
  const previousOwnerId = lead.ownerId;
  lead.assignmentFrom = previousOwnerId;
  lead.ownerId = toOwnerId;
  lead.assignedBy = actorId;
  lead.assignedAt = now;
  lead.assignmentNote = note;
  return { changed: true, previousOwnerId };
}

export interface LeadAssignmentRow {
  leadId: string;
  company: string;
  country: string;
  stage: string;
  status: string;
  ownerId: string;
  ownerName: string;
  fromOwnerName: string;
  assignedByName: string;
  assignedAt: string;
  note: string;
}

/**
 * 指派一览：有过指派记录、未删除、且当前账号有权看到的线索，
 * 按最近指派时间倒序。上级看本团队全部；非上级只看与自己相关的
 * （现归自己、自己指派出去的、或从自己手里派走的）。
 */
export function leadAssignmentRows(leads: Lead[], users: User[], user: SessionUser): LeadAssignmentRow[] {
  const nameById = new Map(users.map((item) => [item.id, item.name]));
  const supervisor = isSupervisorAssigner(user);
  return leads
    .filter((lead) => {
      if (lead.deletedAt) return false;
      if (lead.teamId !== user.teamId) return false;
      if (!lead.assignedBy && !lead.assignedAt) return false;
      if (supervisor) return true;
      return lead.ownerId === user.id || lead.assignedBy === user.id || lead.assignmentFrom === user.id;
    })
    .sort((a, b) => (b.assignedAt || "").localeCompare(a.assignedAt || ""))
    .map((lead) => ({
      leadId: lead.id,
      company: lead.company,
      country: lead.country,
      stage: lead.stage,
      status: lead.status,
      ownerId: lead.ownerId,
      ownerName: nameById.get(lead.ownerId) || "未分配",
      fromOwnerName: lead.assignmentFrom ? nameById.get(lead.assignmentFrom) || "" : "",
      assignedByName: lead.assignedBy ? nameById.get(lead.assignedBy) || "" : "",
      assignedAt: lead.assignedAt || "",
      note: lead.assignmentNote || ""
    }));
}

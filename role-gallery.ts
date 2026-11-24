import { zzzResourceDirectory } from "./card-theme.ts";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog, findTraditionalEntries } from "@lotus-yunzai/atlas/catalog";
import { zzzCharacterGalleryRoot } from "@lotus-yunzai/atlas/gallery";
import { batchInlineImagePages, type InlineImage } from "@lotus-yunzai/skia/forward-images";
import { loadImage } from "skia-canvas";
import { rankGroup, rankMembership, type ChallengeRankContext } from "./challenge-rank.ts";
import { zzzPrefixedCommand } from "./panel-command.ts";
import { readZzzRoleAliases, zzzRoleAlias } from "./role-alias.ts";
import { ownsZzzManagement } from "./role-alias-command.ts";

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const rasterName = /\.(?:png|jpe?g|webp)$/iu;
const managedName = /^lotus-([a-f0-9]{64})\.(?:png|jpg|webp)$/u;
const maxBytes = 8 * 1024 * 1024;
const pageSize = 5;
const listingTtl = 300;
const listingDelivery = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

export function zzzRoleGalleryCommand(message: string) {
  const command = zzzPrefixedCommand(message);
  if (!command || command.length > 150) return;
  const add = /^(?:上传|添加)(\S{1,80})(?:角色|面板)图$/u.exec(command);
  if (add) return { kind: "add", role: add[1]! } as const;
  const list = /^(?:获取|查看)(\S{1,80})(?:角色|面板)图([0-9]{1,5})?$/u.exec(command);
  if (list) return { kind: "list", role: list[1]!, page: Math.max(1, Number(list[2] ?? 1)) } as const;
  const remove = /^删除(\S{1,80})(?:角色|面板)图([0-9]{1,6}(?:[,，、\s]+[0-9]{1,6}){0,4})$/u.exec(command);
  if (remove) return { kind: "remove", role: remove[1]!, ids: [...new Set(remove[2]!.split(/[,，、\s]+/u).map(Number))] } as const;
}

function rasterExtension(data: Uint8Array) {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
}

async function galleryBase(root: string, relatives: readonly string[], create = false) {
  if (create) await mkdir(root, { recursive: true, mode: 0o755 });
  let base = await realpath(root).catch(() => undefined);
  if (!base) return;
  for (const part of relatives) {
    const child: string = join(base, part);
    if (create) await mkdir(child, { mode: 0o755 }).catch(error => {
      if (error.code !== "EEXIST") throw error;
    });
    if (await realpath(child).catch(() => undefined) !== child) return;
    if (!(await lstat(child)).isDirectory()) return;
    base = child;
  }
  return base;
}

async function readRaster(path: string) {
  const input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
  if (!input) return;
  try {
    const info = await input.stat();
    if (!info.isFile() || info.size <= 0 || info.size > maxBytes) return;
    const bytes = Buffer.alloc(info.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await input.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) return;
      offset += bytesRead;
    }
    if (rasterExtension(bytes)) return bytes;
  } finally {
    await input.close();
  }
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type GalleryNode = string | readonly [string, InlineImage];

export interface ZzzRoleGalleryContext extends ChallengeRankContext {
  readonly forward?: (nodes: readonly GalleryNode[]) => Promise<boolean>;
  readonly inlineImageByteLimit?: number;
  readonly self_id?: number;
  readonly characterGallerySignal?: AbortSignal;
  readonly readCharacterGalleryImages?: () => Promise<readonly (Uint8Array | undefined)[] | "too-many">;
}

function listingKey(context: ZzzRoleGalleryContext, role: string, page: number) {
  const room = context.message_type === "group" ? context.group_id : "私聊";
  if (!context.self_id || !context.user_id || !room) return;
  return `lotus-yunzai:zzz-character-gallery:${context.adapter ?? "onebot"}:${context.self_id}:${room}:${context.user_id}:${role}:${page}`;
}

export function createZzzRoleGallery(signal: AbortSignal) {
  const catalogue = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const root = zzzCharacterGalleryRoot();
  const legacy = zzzResourceDirectory()?.trim();
  return async (context: ZzzRoleGalleryContext, command: NonNullable<ReturnType<typeof zzzRoleGalleryCommand>>) => {
    if (signal.aborted || context.isDelegated) return;
    const owns = () => !!context.characterGallerySignal && !context.characterGallerySignal.aborted && ownsZzzManagement(context, signal);
    if (command.kind !== "list" && !owns()) return "仅限主人设置。";
    const group = rankGroup(context);
    try {
      if (command.kind !== "list" && group && !await rankMembership(context, group.actor)) return "暂无法核对当前群成员。";
      const [snapshot, aliases] = await Promise.all([catalogue.read(), readZzzRoleAliases(legacy).catch(() => undefined)]);
      const matches = findTraditionalEntries(snapshot, zzzRoleAlias(aliases, command.role) ?? command.role, "zzz", "character");
      const role = matches.length === 1 ? matches[0]?.entry : undefined;
      if (!role || !/^[\p{L}\p{N}\p{M} .·・_-]{1,80}$/u.test(role.name) || /^\.+$/u.test(role.name)) return "未找到对应代理人。";
      if (snapshot.pages.some(page => page.game === "zzz" && page.kind === "character" &&
          page.entries.filter(entry => entry.name === role.name).length !== 1)) return "代理人名称不唯一，暂无法管理角色图。";

      const path = ["zzz-character", role.name];
      if (command.kind === "add") {
        const images = await context.readCharacterGalleryImages?.() ?? [];
        if (images === "too-many" || images.length > 5) return "每次最多添加 5 张角色图。";
        if (!images.length) return "请随指令发送图片，或引用本会话中含图片的消息。";
        if (!owns()) return "仅限主人设置。";
        const directory = await galleryBase(root, path, true);
        if (!directory) return "图库目录暂不可写。";
        let added = 0, duplicates = 0;
        for (const bytes of images) {
          const extension = bytes && bytes.byteLength <= maxBytes && rasterExtension(bytes);
          if (!bytes || !extension) continue;
          const image = await loadImage(Buffer.from(bytes)).catch(() => undefined);
          if (!image?.width || !image.height || image.width * image.height > 32_000_000 || !owns()) continue;
          const filename = join(directory, `lotus-${digest(bytes)}.${extension}`);
          const temporary = join(directory, `.${randomUUID()}.pending`);
          await writeFile(temporary, bytes, { flag: "wx", mode: 0o644 });
          try {
            if (!owns()) continue;
            try {
              await link(temporary, filename);
              added++;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
              const actual = await readRaster(filename);
              if (actual && digest(actual) === digest(bytes)) duplicates++;
            }
          } finally {
            await unlink(temporary);
          }
        }
        return `已为 ${role.name} 添加 ${added} 张角色图，已有 ${duplicates} 张，未添加 ${images.length - added - duplicates} 张。`;
      }

      const redis = globalThis.redis;
      const writable = await galleryBase(root, path);
      if (command.kind === "remove") {
        if (!redis) return "角色图库设置暂时不可用。";
        if (!writable) return "暂无可删除的角色图。";
        const removed: number[] = [];
        for (const id of command.ids) {
          const key = id > 0 && listingKey(context, role.id, Math.ceil(id / pageSize));
          const encoded = key && await redis.get(key);
          if (!encoded || !encoded.startsWith("{")) continue;
          const { [id]: filename } = JSON.parse(encoded) as Record<string, unknown>;
          if (typeof filename !== "string" || !managedName.test(filename)) continue;
          const file = join(writable, filename);
          const bytes = await readRaster(file);
          if (!bytes || digest(bytes) !== managedName.exec(filename)?.[1] || !owns()) continue;
          const deleted = await unlink(file).then(() => true).catch(() => false);
          if (deleted) removed.push(id);
        }
        const missing = command.ids.filter(id => !removed.includes(id));
        return [removed.length && `已删除角色图 ID ${removed.join("、")}。`,
          missing.length && `ID ${missing.join("、")} 无法删除，请重新查看对应页。旧图库和外部资源只读。`].filter(Boolean).join("\n");
      }

      const legacyPath = ["images", "panel"];
      const readonlyDir = legacy && await galleryBase(legacy, [...legacyPath, role.name]);
      const sources = [writable, readonlyDir].filter((value): value is string => Boolean(value));
      const entries: { filename: string; directory: string; editable: boolean }[] = [];
      for (const directory of new Set(sources)) {
        for (const file of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
          if (file.isFile() && rasterName.test(file.name)) {
            entries.push({ filename: file.name, directory, editable: directory === writable && managedName.test(file.name) });
          }
        }
      }
      const flat = [await galleryBase(root, ["zzz-character"]), legacy && await galleryBase(legacy, legacyPath)]
        .filter((value): value is string => Boolean(value));
      for (const directory of new Set(flat)) {
        for (const extension of [".webp", ".png", ".jpg", ".jpeg"]) {
          const filename = role.name + extension;
          if ((await lstat(join(directory, filename)).catch(() => undefined))?.isFile()) entries.push({ filename, directory, editable: false });
        }
      }
      const pages = Math.ceil(entries.length / pageSize);
      if (!pages) return `${role.name} 暂无角色图。`;
      if (command.page > pages) return `只有 ${pages} 页角色图。`;
      const start = (command.page - 1) * pageSize;
      const title = `${role.name} 角色图第 ${command.page}/${pages} 页，查询指定页请在指令后加页码。`;
      const listing: { id: number; node: GalleryNode; size: number; editableFile?: string }[] = [];
      for (const [offset, entry] of entries.slice(start, start + pageSize).entries()) {
        const id = start + offset + 1;
        const image = await readRaster(join(entry.directory, entry.filename));
        const editable = entry.editable && image && digest(image) === managedName.exec(entry.filename)?.[1];
        const node: GalleryNode = image
          ? [`ID：${id}${editable ? "" : "（只读）"}`, { type: "image", file: image }]
          : `ID：${id} 暂无法读取。`;
        listing.push({ id, node, size: image?.byteLength ?? 0, editableFile: editable ? entry.filename : undefined });
      }
      const key = owns() && listingKey(context, role.id, command.page);
      const ticket = randomUUID();
      let receipt = "待回执:" + ticket;
      const pending = key && redis && await redis.set(key, receipt, { EX: listingTtl }).catch(() => undefined);
      const batches = batchInlineImagePages(listing, context.inlineImageByteLimit, entry => entry.size);
      if (!batches) return "本页有角色原图超过当前会话大小上限，未发送本页。";
      if (!context.forward) return "当前会话无法合并转发角色图。";

      // A unique ticket keeps late confirmations from updating a newer listing of the same page.
      const delivered: Record<string, string> = { listing: ticket };
      for (const [index, batch] of batches.entries()) {
        if (signal.aborted) return [];
        if (pending && !owns()) return "角色图库管理权限已变化，请重新查看。";
        const heading = batches.length === 1 ? title : `${title}（第 ${index + 1}/${batches.length} 段）`;
        const nodes = [heading, ...batch.map(entry => entry.node)];
        if (pending) nodes.push("主人可在本段确认送达后五分钟内删除本段自建角色图。");
        try {
          if (!await context.forward(nodes)) return `第 ${index + 1} 段角色图合并转发未发送，其余段落已停止。`;
        } catch {
          return `第 ${index + 1} 段角色图合并转发结果未确认，请在聊天中核对。`;
        }
        if (pending && key && redis && owns()) {
          for (const { id, editableFile } of batch) if (editableFile) delivered[id] = editableFile;
          const confirmed = JSON.stringify(delivered);
          const saved = await redis.eval(listingDelivery, { keys: [key], arguments: [receipt, confirmed, String(listingTtl)] })
            .catch(() => undefined);
          if (saved !== 1) return "角色图已发送，但本页删除回执未登记，请重新查看。";
          receipt = confirmed;
        }
      }
      return [];
    } catch {
      return "角色图库暂时不可用。";
    }
  };
}

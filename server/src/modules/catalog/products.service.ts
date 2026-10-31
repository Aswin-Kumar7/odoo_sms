import { Prisma, type ProductType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { businessRule, notFound } from "../../lib/errors.js";
import { paging } from "../../lib/http.js";

export interface VariantInput {
  id?: number;
  name: string;
  attributes: Record<string, string>;
  priceExtra: number;
  isActive?: boolean;
}

export interface ProductInput {
  name: string;
  type: ProductType;
  salesPrice: number;
  costPrice: number;
  notes?: string | null;
  taxId?: number | null;
  isActive?: boolean;
  variants?: VariantInput[];
}

const detailInclude = {
  tax: { select: { id: true, name: true, rateBp: true } },
  variants: { orderBy: { id: "asc" } },
} satisfies Prisma.ProductInclude;

export async function listProducts(opts: { page: number; pageSize: number; q?: string; type?: ProductType; includeInactive: boolean }) {
  const where: Prisma.ProductWhereInput = {
    ...(opts.includeInactive ? {} : { isActive: true }),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        tax: { select: { id: true, name: true, rateBp: true } },
        variants: { where: { isActive: true }, select: { id: true, name: true, priceExtra: true }, orderBy: { id: "asc" } },
      },
      ...paging(opts.page, opts.pageSize),
    }),
  ]);
  return { data, page: opts.page, pageSize: opts.pageSize, total };
}

export async function getProduct(id: number) {
  const product = await prisma.product.findUnique({ where: { id }, include: detailInclude });
  if (!product) throw notFound("Product");
  return product;
}

async function assertTaxUsable(taxId: number | null | undefined) {
  if (taxId == null) return;
  const tax = await prisma.tax.findUnique({ where: { id: taxId }, select: { isActive: true } });
  if (!tax || !tax.isActive) throw businessRule("Selected tax does not exist or is inactive");
}

function assertUniqueVariantNames(variants: VariantInput[] | undefined) {
  if (!variants) return;
  const names = variants.map((v) => v.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw businessRule("Variant names must be unique within a product");
}

export async function createProduct(input: ProductInput) {
  await assertTaxUsable(input.taxId);
  assertUniqueVariantNames(input.variants);
  const { variants = [], ...fields } = input;
  return prisma.product.create({
    data: {
      ...fields,
      variants: { create: variants.map(({ id: _id, ...v }) => v) },
    },
    include: detailInclude,
  });
}

/**
 * Updates product fields and synchronises its variants in one transaction:
 * listed variants with an id are updated, new ones created, and omitted ones
 * deactivated (not deleted — subscription lines may still reference them).
 */
export async function updateProduct(id: number, input: Partial<ProductInput>) {
  const existing = await prisma.product.findUnique({ where: { id }, include: { variants: { select: { id: true } } } });
  if (!existing) throw notFound("Product");
  await assertTaxUsable(input.taxId);
  assertUniqueVariantNames(input.variants);

  const { variants, ...fields } = input;
  const ownIds = new Set(existing.variants.map((v) => v.id));
  if (variants?.some((v) => v.id !== undefined && !ownIds.has(v.id))) throw businessRule("A variant does not belong to this product");

  return prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: fields });
    if (variants) {
      const keep = new Set(variants.filter((v) => v.id !== undefined).map((v) => v.id!));
      const removed = [...ownIds].filter((vid) => !keep.has(vid));
      if (removed.length) await tx.productVariant.updateMany({ where: { id: { in: removed } }, data: { isActive: false } });
      for (const { id: vid, ...v } of variants) {
        if (vid !== undefined) await tx.productVariant.update({ where: { id: vid }, data: { ...v, isActive: v.isActive ?? true } });
        else await tx.productVariant.create({ data: { ...v, productId: id } });
      }
    }
    return tx.product.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });
}

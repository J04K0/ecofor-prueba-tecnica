import { pool } from "../db/index.js";

export interface CouponInput {
  code: string;
  type: "percentage" | "fixed_amount" | "n_for_m";
  stackable: boolean;
  value?: number;
  sku?: string;
  n?: number;
  m?: number;
  min_amount?: number;
  applicable_skus?: string[];
}

interface OrderItem {
  product_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface ItemDiscount {
  product_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  amount: number;
  discount: number;
  final_amount: number;
  coupons: string[];
}

interface DiscountResult {
  coupons: string[];
  totalDiscount: number;
  items: ItemDiscount[];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCouponApplicable(
  coupon: CouponInput,
  subtotal: number
): boolean {
  if (
    coupon.min_amount !== undefined &&
    subtotal < coupon.min_amount
  ) {
    return false;
  }

  return true;
}

function calculateCouponDiscount(
    coupon: CouponInput,
    item: OrderItem
  ): number {
    if (
      coupon.applicable_skus &&
      !coupon.applicable_skus.includes(item.sku)
    ) {
      return 0;
    }
  
    if (coupon.type === "percentage") {
      return roundMoney(
        item.amount * ((coupon.value ?? 0) / 100)
      );
    }
  
    if (coupon.type === "fixed_amount") {
      return roundMoney(
        Math.min(coupon.value ?? 0, item.amount)
      );
    }
  
    if (coupon.type === "n_for_m") {
      if (coupon.sku !== item.sku) {
        return 0;
      }
  
      const n = coupon.n ?? 0;
      const m = coupon.m ?? 0;
  
      if (n <= 0 || m < 0 || m >= n) {
        return 0;
      }
  
      const groups = Math.floor(item.quantity / n);
      const freeUnits = groups * (n - m);
  
      return roundMoney(
        freeUnits * item.unit_price
      );
    }
  
    return 0;
  }

  function evaluateCoupons(
    coupons: CouponInput[],
    items: OrderItem[]
  ): DiscountResult {
    const discounts = items.map(() => 0);
    const itemCoupons = items.map(() => [] as string[]);
  
    for (const coupon of coupons) {
      if (coupon.type === "fixed_amount") {
        let remaining = roundMoney(coupon.value ?? 0);
  
        for (let index = 0; index < items.length; index++) {
          if (remaining <= 0) break;
  
          const item = items[index];
  
          if (
            coupon.applicable_skus &&
            !coupon.applicable_skus.includes(item.sku)
          ) {
            continue;
          }
  
          const availableAmount = roundMoney(
            item.amount - discounts[index]
          );
  
          if (availableAmount <= 0) {
            continue;
          }
  
          const discount = roundMoney(
            Math.min(remaining, availableAmount)
          );
  
          if (discount > 0) {
            discounts[index] = roundMoney(
              discounts[index] + discount
            );
  
            itemCoupons[index].push(coupon.code);
  
            remaining = roundMoney(
              remaining - discount
            );
          }
        }
  
        continue;
      }
  
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
  
        const couponDiscount =
          calculateCouponDiscount(coupon, item);
  
        if (couponDiscount <= 0) {
          continue;
        }
  
        const availableAmount = roundMoney(
          item.amount - discounts[index]
        );
  
        const appliedDiscount = roundMoney(
          Math.min(couponDiscount, availableAmount)
        );
  
        if (appliedDiscount > 0) {
          discounts[index] = roundMoney(
            discounts[index] + appliedDiscount
          );
  
          itemCoupons[index].push(coupon.code);
        }
      }
    }
  
    const resultItems: ItemDiscount[] = items.map(
      (item, index) => {
        const discount = roundMoney(
          Math.min(discounts[index], item.amount)
        );
  
        return {
          product_id: item.product_id,
          sku: item.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          discount,
          final_amount: roundMoney(
            item.amount - discount
          ),
          coupons: itemCoupons[index],
        };
      }
    );
  
    const totalDiscount = roundMoney(
      resultItems.reduce(
        (sum, item) => sum + item.discount,
        0
      )
    );
  
    return {
      coupons: Array.from(
        new Set(
          resultItems.flatMap(
            (item) => item.coupons
          )
        )
      ),
      totalDiscount,
      items: resultItems,
    };
  }

  export async function applyDiscounts(
    orderId: number,
    coupons: CouponInput[]
  ) {
    const orderResult = await pool.query(
      `
      SELECT id
      FROM orders
      WHERE id = $1
      `,
      [orderId]
    );
  
    if (orderResult.rowCount === 0) {
      throw {
        status: 404,
        message: "Orden no encontrada",
      };
    }
  
    const itemsResult = await pool.query(
      `
      SELECT
        oi.product_id,
        p.sku,
        oi.quantity,
        oi.unit_price::numeric(12,2)::text AS unit_price
      FROM order_items oi
      JOIN products p
        ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.id
      `,
      [orderId]
    );
  
    const items: OrderItem[] = itemsResult.rows.map((item) => {
      const unitPrice = Number(item.unit_price);
  
      return {
        product_id: item.product_id,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: unitPrice,
        amount: roundMoney(
          item.quantity * unitPrice
        ),
      };
    });
  
    const subtotal = roundMoney(
      items.reduce(
        (sum, item) => sum + item.amount,
        0
      )
    );
  
    const validCoupons = coupons.filter((coupon) =>
      isCouponApplicable(coupon, subtotal)
    );
  
    const stackableCoupons = validCoupons.filter(
      (coupon) => coupon.stackable
    );
  
    const nonStackableCoupons = validCoupons.filter(
      (coupon) => !coupon.stackable
    );
  
    let bestResult = evaluateCoupons(
      stackableCoupons,
      items
    );
  
    for (const coupon of nonStackableCoupons) {
      const candidate = evaluateCoupons(
        [coupon],
        items
      );
  
      if (
        candidate.totalDiscount >
        bestResult.totalDiscount
      ) {
        bestResult = candidate;
      }
    }
  
    return {
      order_id: orderId,
      subtotal: subtotal.toFixed(2),
  
      applied_coupons: bestResult.coupons,
  
      total_discount:
        bestResult.totalDiscount.toFixed(2),
  
      total: roundMoney(
        subtotal - bestResult.totalDiscount
      ).toFixed(2),
  
      items: bestResult.items.map((item) => ({
        product_id: item.product_id,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price.toFixed(2),
        amount: item.amount.toFixed(2),
        discount: item.discount.toFixed(2),
        final_amount: item.final_amount.toFixed(2),
        coupons: item.coupons,
      })),
    };
  }
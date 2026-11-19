type Row = { retailerPrice: number | null; salePrice: number | null };

/**
 * What a shopper pays for a product (or one of its variants), and the price it is marked down from.
 * `was` is null when the item is not on sale. A sale price only counts when it is below the normal one.
 * A variant with its own retailer price has its own sale price too; otherwise it follows the product's.
 */
export function sellPrice(product: { retailerPrice: number; salePrice: number | null }, variant?: Row | null) {
  const regular = variant?.retailerPrice ?? product.retailerPrice;
  const sale = variant ? (variant.salePrice ?? (variant.retailerPrice == null ? product.salePrice : null)) : product.salePrice;
  return sale != null && sale > 0 && sale < regular ? { price: sale, was: regular } : { price: regular, was: null };
}

/**
 * Barcode & Product Packaging Lookup Tool
 *
 * Resolves UPC, EAN, ISBN, and NDC barcode identifiers from product packaging,
 * medication cartons, food items, and hardware via keyless OpenFoodFacts & OpenFDA APIs.
 */

import { proxyJson } from './http'

export function normalizeBarcode(code = '') {
  return String(code || '').replace(/\D/g, '').trim()
}

export const barcodeLookupTool = {
  schema: {
    name: 'barcode_lookup',
    description:
      'Look up a product or medication packaging by its scanned UPC, EAN, or ISBN barcode number. ' +
      'Returns product title, brand, manufacturer, ingredients/composition, and packaging details.',
    parameters: {
      type: 'object',
      properties: {
        barcode: {
          type: 'string',
          description: 'The numeric barcode string (e.g. 12-digit UPC or 13-digit EAN, e.g. "0300450449147")',
        },
      },
      required: ['barcode'],
    },
  },
  async execute({ barcode = '' } = {}) {
    const cleanCode = normalizeBarcode(barcode)
    if (!cleanCode || cleanCode.length < 8) {
      return {
        success: false,
        error: 'Please provide a valid barcode number (at least 8 numeric digits).',
      }
    }

    try {
      // 1. Try OpenFoodFacts / OpenBeautyFacts
      const url = `https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`
      const data = await proxyJson(url)

      if (data?.status === 1 && data?.product) {
        const p = data.product
        return {
          success: true,
          tool: 'barcode_lookup',
          barcode: cleanCode,
          product_name: p.product_name || p.product_name_en || undefined,
          brand: p.brands || undefined,
          categories: p.categories || undefined,
          ingredients: p.ingredients_text || undefined,
          quantity: p.quantity || undefined,
          image_url: p.image_url || undefined,
          nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : undefined,
        }
      }

      // 2. Try OpenFDA NDC lookup if it matches a 10 or 11 digit format
      const fdaUrl = `https://api.fda.gov/drug/ndc.json?search=packaging.package_ndc:"${cleanCode}"+product_ndc:"${cleanCode}"&limit=1`
      const fdaData = await proxyJson(fdaUrl).catch(() => null)
      if (fdaData?.results?.[0]) {
        const drug = fdaData.results[0]
        return {
          success: true,
          tool: 'barcode_lookup',
          barcode: cleanCode,
          product_name: drug.brand_name || drug.generic_name,
          generic_name: drug.generic_name,
          manufacturer: drug.labeler_name,
          dosage_form: drug.dosage_form,
          active_ingredients: drug.active_ingredients?.map(i => `${i.name} ${i.strength}`).join(', '),
          product_type: drug.product_type,
        }
      }

      return {
        success: false,
        barcode: cleanCode,
        note: `No direct database entry found for barcode ${cleanCode}. Try searching the brand name directly.`,
      }
    } catch (e) {
      return {
        success: false,
        error: `Barcode lookup failed: ${e?.message || e}`,
        barcode: cleanCode,
      }
    }
  },
}

/**
 * Hardware pricing calculations — isolated so client formula changes
 * only need updates here (and the mirrored client util).
 *
 * Temporary business assumptions throughout.
 * Replace when client finalises pricing rules.
 */

const { PRICING_BASIS } = require('../../config/constants');

// Temporary business assumption.
// Replace when client finalises VAT handling.
const VAT_MULTIPLIER = 1.15;

const DEFAULT_MARKUP = 1;

const toNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

const roundPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

/**
 * Temporary business assumption.
 * Standard margin % = (selling − cost) / selling × 100.
 * Replace when client finalises margin definitions.
 */
const standardMarginPercent = (selling, cost) => {
  if (selling == null || cost == null || selling === 0) return null;
  return roundPercent(((selling - cost) / selling) * 100);
};

const maxCost = (cpt, jhb) => {
  if (cpt == null && jhb == null) return null;
  if (cpt == null) return jhb;
  if (jhb == null) return cpt;
  return Math.max(cpt, jhb);
};

const buildMargins = ({ agreed, mnfPrice, frcPrice, retailPriceExVat }) => ({
  // Temporary business assumption. Replace when client finalises margin rules.
  marginFranRet: standardMarginPercent(retailPriceExVat, frcPrice),
  marginHwMnf: standardMarginPercent(mnfPrice, agreed),
  marginHwFran: standardMarginPercent(frcPrice, agreed),
});

/**
 * Scenario 1 — Pricing Basis = Agreed
 * User enters CPT, JHB, markups; system calculates the rest.
 */
const calculateAgreedBasis = ({ cpt, jhb, mnfMarkup, frcMarkup, retailMarkup }) => {
  // Temporary business assumption. Replace when client finalises pricing rules.
  const varCost = cpt != null && jhb != null ? roundMoney(jhb - cpt) : null;
  const agreed = roundMoney(maxCost(cpt, jhb));

  const mnfPrice = agreed != null ? roundMoney(agreed * mnfMarkup) : null;
  // Temporary: FRC base is the MNF price the franchise markup applies to.
  const frcBase = mnfPrice;
  const frcPrice = frcBase != null ? roundMoney(frcBase * frcMarkup) : null;
  const retailPriceExVat = frcPrice != null ? roundMoney(frcPrice * retailMarkup) : null;
  const retailPriceInclVat =
    retailPriceExVat != null ? roundMoney(retailPriceExVat * VAT_MULTIPLIER) : null;

  return {
    var: varCost,
    agreed,
    mnfMarkup,
    mnfPrice,
    frcMarkup,
    frcBase,
    frcPrice,
    retailMarkup,
    retailPriceExVat,
    retailPriceInclVat,
    margins: buildMargins({ agreed, mnfPrice, frcPrice, retailPriceExVat }),
  };
};

/**
 * Scenario 2 — Pricing Basis = Retail
 * Retail is supplied; costs are derived backwards.
 */
const calculateRetailBasis = ({ cpt, jhb, mnfMarkup, frcMarkup, retailMarkup }) => {
  // Temporary business assumption.
  // Treat max(CPT, JHB) as supplier retail Ex VAT until "RET from Supplier" is clarified.
  // Then reverse through markups. Replace when client finalises reverse formulas.
  const varCost = cpt != null && jhb != null ? roundMoney(jhb - cpt) : null;
  const retailPriceExVat = roundMoney(maxCost(cpt, jhb));
  const retailPriceInclVat =
    retailPriceExVat != null ? roundMoney(retailPriceExVat * VAT_MULTIPLIER) : null;

  const frcPrice =
    retailPriceExVat != null && retailMarkup > 0
      ? roundMoney(retailPriceExVat / retailMarkup)
      : null;
  const mnfPrice = frcPrice != null && frcMarkup > 0 ? roundMoney(frcPrice / frcMarkup) : null;
  const frcBase = mnfPrice;
  const agreed = mnfPrice != null && mnfMarkup > 0 ? roundMoney(mnfPrice / mnfMarkup) : null;

  return {
    var: varCost,
    agreed,
    mnfMarkup,
    mnfPrice,
    frcMarkup,
    frcBase,
    frcPrice,
    retailMarkup,
    retailPriceExVat,
    retailPriceInclVat,
    margins: buildMargins({ agreed, mnfPrice, frcPrice, retailPriceExVat }),
  };
};

/**
 * @param {object} input — hardware item source fields (flat or with regionalCosts)
 * @returns {object} calculated pricing fields + margins
 */
const calculateHardwarePricing = (input = {}) => {
  const regional = input.regionalCosts || {};
  const cpt = toNumber(input.cpt ?? regional.cpt);
  const jhb = toNumber(input.jhb ?? regional.jhb);
  const pricingBasis = input.pricingBasis || PRICING_BASIS.AGREED;
  const mnfMarkup = toNumber(input.mnfMarkup, DEFAULT_MARKUP);
  const frcMarkup = toNumber(input.frcMarkup, DEFAULT_MARKUP);
  const retailMarkup = toNumber(input.retailMarkup, DEFAULT_MARKUP);

  if (pricingBasis === PRICING_BASIS.RETAIL) {
    return {
      pricingBasis,
      ...calculateRetailBasis({ cpt, jhb, mnfMarkup, frcMarkup, retailMarkup }),
    };
  }

  return {
    pricingBasis,
    ...calculateAgreedBasis({ cpt, jhb, mnfMarkup, frcMarkup, retailMarkup }),
  };
};

const buildPricingSummary = (details) => ({
  agreed: details.agreed,
  mnfPrice: details.mnfPrice,
  frcPrice: details.frcPrice,
  retailPriceExVat: details.retailPriceExVat,
});

module.exports = {
  VAT_MULTIPLIER,
  DEFAULT_MARKUP,
  calculateHardwarePricing,
  buildPricingSummary,
};

/**
 * Hardware Master File pricing — Excel-faithful formulas from Master File sheet.
 *
 * Source: Hardware Master File_National_01102023.xlsx → Master File
 *
 * VAR          = JHB − CPT
 * AGREED       = MAX(CPT, JHB)
 * MNF Price    = AGREED × MNF Markup
 * FRC Price    = IF(FRC Base="Agreed", AGREED×FRC Markup, RET Excl×FRC Markup)
 * RET Excl VAT = IF(FRC Base="Agreed", FRC×RET Markup, RET from Supplier)
 * RET Incl VAT = RET Excl × 1.15
 * Margins      = (selling − cost) / selling × 100
 */

const { PRICING_BASIS } = require('../../config/constants');

const VAT_MULTIPLIER = 1.15;
const DEFAULT_MARKUP = 1;

const toNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 10000;
};

const roundPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
};

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
  marginFranRet: standardMarginPercent(retailPriceExVat, frcPrice),
  marginHwMnf: standardMarginPercent(mnfPrice, agreed),
  marginHwFran: standardMarginPercent(frcPrice, agreed),
});

/**
 * FRC Base = Agreed
 * FRC = AGREED × FRC Markup (Excel N = I×L)
 * RET Excl = FRC × RET Markup (Excel P = N×O)
 */
const calculateAgreedBasis = ({ cpt, jhb, mnfMarkup, frcMarkup, retailMarkup }) => {
  const varCost = cpt != null && jhb != null ? roundMoney(jhb - cpt) : null;
  const agreed = roundMoney(maxCost(cpt, jhb));
  const mnfPrice = agreed != null ? roundMoney(agreed * mnfMarkup) : null;
  const frcPrice = agreed != null ? roundMoney(agreed * frcMarkup) : null;
  const retailPriceExVat =
    frcPrice != null ? roundMoney(frcPrice * retailMarkup) : null;
  const retailPriceInclVat =
    retailPriceExVat != null
      ? roundMoney(retailPriceExVat * VAT_MULTIPLIER)
      : null;

  return {
    var: varCost,
    agreed,
    mnfMarkup,
    mnfPrice,
    frcMarkup,
    frcBase: PRICING_BASIS.AGREED,
    frcPrice,
    retailMarkup,
    retFromSupplier: null,
    retailPriceExVat,
    retailPriceInclVat,
    margins: buildMargins({ agreed, mnfPrice, frcPrice, retailPriceExVat }),
  };
};

/**
 * FRC Base = Retail
 * RET Excl = RET from Supplier (Excel P = R)
 * FRC = RET Excl × FRC Markup (Excel N = P×L)
 * AGREED / MNF still from regional costs (Excel keeps those formulas)
 */
const calculateRetailBasis = ({
  cpt,
  jhb,
  mnfMarkup,
  frcMarkup,
  retailMarkup,
  retFromSupplier,
}) => {
  const varCost = cpt != null && jhb != null ? roundMoney(jhb - cpt) : null;
  const agreed = roundMoney(maxCost(cpt, jhb));
  const mnfPrice = agreed != null ? roundMoney(agreed * mnfMarkup) : null;
  const retailPriceExVat = roundMoney(retFromSupplier);
  const frcPrice =
    retailPriceExVat != null ? roundMoney(retailPriceExVat * frcMarkup) : null;
  const retailPriceInclVat =
    retailPriceExVat != null
      ? roundMoney(retailPriceExVat * VAT_MULTIPLIER)
      : null;

  return {
    var: varCost,
    agreed,
    mnfMarkup,
    mnfPrice,
    frcMarkup,
    frcBase: PRICING_BASIS.RETAIL,
    frcPrice,
    retailMarkup,
    retFromSupplier: retailPriceExVat,
    retailPriceExVat,
    retailPriceInclVat,
    margins: buildMargins({ agreed, mnfPrice, frcPrice, retailPriceExVat }),
  };
};

/**
 * @param {object} input — hardware item source fields (flat or with regionalCosts)
 */
const calculateHardwarePricing = (input = {}) => {
  const regional = input.regionalCosts || {};
  const cpt = toNumber(input.cpt ?? regional.cpt);
  const jhb = toNumber(input.jhb ?? regional.jhb);
  const pricingBasis = input.pricingBasis || PRICING_BASIS.AGREED;
  const mnfMarkup = toNumber(input.mnfMarkup, DEFAULT_MARKUP);
  const frcMarkup = toNumber(input.frcMarkup, DEFAULT_MARKUP);
  const retailMarkup = toNumber(input.retailMarkup, DEFAULT_MARKUP);
  const retFromSupplier = toNumber(
    input.retFromSupplier ?? regional.retFromSupplier
  );

  if (pricingBasis === PRICING_BASIS.RETAIL) {
    return {
      pricingBasis,
      ...calculateRetailBasis({
        cpt,
        jhb,
        mnfMarkup,
        frcMarkup,
        retailMarkup,
        retFromSupplier,
      }),
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

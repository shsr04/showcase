import { CONFIG } from './config.js';

export class Economy {
    constructor() {
        this.taxRate = CONFIG.INITIAL_TAX_RATE;
        this.ubi = CONFIG.INITIAL_UBI;
        this.treasury = 1000000; // Government funds

        this.dailyTaxRevenue = 0;
        this.dailyWelfareSpend = 0;
    }

    newDay() {
        this.dailyTaxRevenue = 0;
        this.dailyWelfareSpend = 0;
    }

    collectTax(amount) {
        this.treasury += amount;
        this.dailyTaxRevenue += amount;
    }

    distributeUBI(populationCount) {
        const total = this.ubi * populationCount;
        this.treasury -= total;
        this.dailyWelfareSpend += total;
    }

    setTaxRate(rate) {
        this.taxRate = Math.max(0, Math.min(1, rate));
    }

    setUBI(amount) {
        this.ubi = Math.max(0, amount);
    }
}

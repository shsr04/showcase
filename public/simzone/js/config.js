export const CONFIG = {
    // Simulation
    STARTING_POPULATION: 1000,
    GRID_SIZE: 100, // 100x100 grid

    // Time
    MS_PER_DAY: 1000, // 1 real second = 1 simulation day (default)

    // Economy Baseline (Monthly values, processed daily)
    MIN_WAGE: 1500,
    AVG_RENT_LOW: 500,
    AVG_RENT_MED: 1200,
    AVG_RENT_HIGH: 3000,

    FOOD_COST_DAILY: 20,
    TRANSPORT_COST_DAILY: 5,

    // Taxes & Welfare
    INITIAL_TAX_RATE: 0.20,
    INITIAL_UBI: 0,

    // Thresholds
    POVERTY_LINE: 1000, // Net worth
    WEALTHY_LINE: 50000,

    // Zones
    ZONE_TYPES: {
        RESIDENTIAL_LOW: 'low_res',
        RESIDENTIAL_MED: 'med_res',
        RESIDENTIAL_HIGH: 'high_res',
        COMMERCIAL: 'commercial',
        INDUSTRIAL: 'industrial',
        PARK: 'park',
        EMPTY: 'empty'
    },

    COLORS: {
        low_res: '#a1887f',
        med_res: '#4db6ac',
        high_res: '#ffd54f',
        commercial: '#7986cb',
        industrial: '#90a4ae',
        park: '#81c784',
        empty: '#212121',
        citizen: '#ffffff',
        homeless: '#ff5252'
    }
};

'use strict';

// Short, plain-language lessons. Each insight links to one of these.
const LESSONS = [
    {
        id: 'start_here',
        title: 'How to use your practice account',
        body: [
            'You have practice money to invest at real market prices. Nothing you do here uses real money.',
            'Every time you trade, you say why. Over time the Coach shows which reasons actually made you money, which is the fastest way to learn your own habits.',
            'The "If you had bought Nifty" number shows what the same rupees would be worth in a simple index fund. Beating it consistently is genuinely hard; most professional funds do not.',
        ],
    },
    {
        id: 'index_funds',
        title: 'Why the index is the benchmark',
        body: [
            'An index fund (for example a Nifty 50 fund) owns a slice of the largest companies, so you get the market\'s return for a very low fee.',
            'Over long periods most active investors earn less than the index after costs. If your trades do not beat the index, a monthly SIP into an index fund is the sensible default.',
        ],
    },
    {
        id: 'diversification',
        title: 'Diversification: don\'t bet everything on one thing',
        body: [
            'When one position is a large part of your money, a single bad result (a weak quarter, a fraud, a crash) can wipe out months of gains.',
            'Spreading money across several unrelated companies and sectors lowers risk without necessarily lowering long-term returns. A common rule of thumb is no single stock above 10–20%.',
        ],
    },
    {
        id: 'drawdown',
        title: 'Drawdowns are normal',
        body: [
            'A drawdown is the fall from a peak. Even great investments regularly drop 20–30% along the way.',
            'Remember the maths: after a 50% fall you need a 100% gain just to get back. Position sizes that let you sleep at night are what keep you from selling at the bottom.',
        ],
    },
    {
        id: 'overtrading',
        title: 'Overtrading',
        body: [
            'Every trade costs fees and taxes, and short-term moves are mostly noise. Studies of retail investors consistently find that those who trade the most earn the least.',
            'Before each trade ask: has anything really changed since I last looked? If not, doing nothing is often the best move.',
        ],
    },
    {
        id: 'chasing',
        title: 'Chasing a rally',
        body: [
            'Buying right after a big jump feels safe because everyone is excited, but you are paying a higher price for the same company.',
            'Decide what a stock is worth to you before you look at today\'s move, and use limit prices or staggered buys instead of buying in the excitement.',
        ],
    },
    {
        id: 'panic_selling',
        title: 'Panic selling',
        body: [
            'Selling right after a sharp drop locks in the loss and often happens just before a recovery.',
            'Write down, before you buy, what would make you sell (a broken business, not a scary day). If that has not happened, a falling price alone is not a reason.',
        ],
    },
    {
        id: 'disposition',
        title: 'Selling winners, keeping losers',
        body: [
            'It feels good to take a profit and painful to admit a loss, so people tend to sell winners too early and hold losers too long. Economists call this the disposition effect.',
            'Judge each position by its future, not by whether you are up or down on it.',
        ],
    },
    {
        id: 'tips',
        title: 'Tips and hot recommendations',
        body: [
            'Tips from social media, chats or friends usually arrive after the price has already moved, and some are pump-and-dump schemes.',
            'In India, only SEBI-registered advisers may give paid investment advice. Treat anonymous tips as a reason to research, never as a reason to buy.',
        ],
    },
    {
        id: 'fees',
        title: 'Costs add up',
        body: [
            'Brokerage, taxes and the bid-ask spread are charged on every trade. Small percentages become large when you trade often.',
            'Compare your total costs with your profit: if costs eat a big share of your gains, trade less and hold longer.',
        ],
    },
];

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
const getLesson = (id) => BY_ID.get(id) ?? null;

module.exports = { LESSONS, getLesson };

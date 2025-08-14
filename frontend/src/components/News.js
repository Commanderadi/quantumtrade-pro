import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaNewspaper, FaFilter, FaSearch, FaExternalLinkAlt, FaClock, FaTag } from 'react-icons/fa';
import './News.css';

const News = () => {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const filters = [
        { label: 'All News', value: 'all' },
        { label: 'Stocks', value: 'stocks' },
        { label: 'Crypto', value: 'crypto' },
        { label: 'Market', value: 'market' },
        { label: 'Economy', value: 'economy' }
    ];

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        setLoading(true);
        setError('');
        
        try {
            // For now, we'll use mock news data
            // In a real implementation, this would fetch from a news API
            const mockNews = generateMockNews();
            setNews(mockNews);
        } catch (err) {
            setError('Failed to fetch news');
            console.error('News fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const generateMockNews = () => {
        const newsItems = [
            {
                id: 1,
                title: "Tech Stocks Rally as AI Innovation Drives Market Growth",
                summary: "Major technology companies see significant gains as artificial intelligence developments continue to reshape the industry landscape.",
                content: "Technology stocks experienced a strong rally today as investors continue to bet on the transformative potential of artificial intelligence. Companies like NVIDIA, Microsoft, and Alphabet led the charge with gains of 3-5% as new AI developments were announced.",
                category: "stocks",
                source: "Financial Times",
                publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#007bff"
            },
            {
                id: 2,
                title: "Bitcoin Surges Past $50,000 as Institutional Adoption Grows",
                summary: "Cryptocurrency markets show strong momentum with Bitcoin reaching new yearly highs amid increasing institutional interest.",
                content: "Bitcoin has broken through the $50,000 resistance level for the first time this year, driven by growing institutional adoption and positive regulatory developments. The cryptocurrency market cap has increased by 15% over the past week.",
                category: "crypto",
                source: "CoinDesk",
                publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#ffc107"
            },
            {
                id: 3,
                title: "Federal Reserve Signals Potential Rate Cut in Q2",
                summary: "Central bank officials hint at possible monetary policy adjustments as inflation data shows signs of cooling.",
                content: "Federal Reserve officials have indicated that they may consider interest rate cuts in the second quarter of this year, citing improved inflation metrics and economic stability. This news has positively impacted bond markets and growth stocks.",
                category: "economy",
                source: "Wall Street Journal",
                publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#28a745"
            },
            {
                id: 4,
                title: "Global Markets React to Trade Agreement Between Major Economies",
                summary: "International markets show positive response to new trade deal that could boost global economic growth.",
                content: "Major global markets have responded positively to the announcement of a comprehensive trade agreement between leading economies. The deal is expected to reduce tariffs and increase market access, potentially boosting global GDP by 0.5%.",
                category: "market",
                source: "Reuters",
                publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#17a2b8"
            },
            {
                id: 5,
                title: "Earnings Season Kicks Off with Strong Results from Banking Sector",
                summary: "Major banks report better-than-expected earnings, setting positive tone for the upcoming earnings season.",
                content: "The banking sector has kicked off earnings season with strong results, with major institutions reporting better-than-expected profits. This positive start has analysts optimistic about the overall market performance this quarter.",
                category: "stocks",
                source: "Bloomberg",
                publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#6f42c1"
            },
            {
                id: 6,
                title: "Ethereum Upgrade Shows Promise for DeFi Ecosystem Growth",
                summary: "Recent Ethereum network improvements demonstrate potential for significant growth in decentralized finance applications.",
                content: "The latest Ethereum network upgrade has shown promising results, with improved transaction speeds and reduced gas fees. This development is expected to accelerate growth in the DeFi ecosystem and attract more institutional investors.",
                category: "crypto",
                source: "Decrypt",
                publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                url: "#",
                image: null, // Use CSS placeholder instead
                color: "#dc3545"
            }
        ];

        return newsItems;
    };

    const formatTimeAgo = (date) => {
        const now = new Date();
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        if (diffInHours < 1) return 'Just now';
        if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    };

    const filteredNews = news.filter(item => {
        const matchesFilter = filter === 'all' || item.category === filter;
        const matchesSearch = searchTerm === '' || 
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.summary.toLowerCase().includes(searchTerm.toLowerCase());
        
        return matchesFilter && matchesSearch;
    });

    const handleNewsClick = (url) => {
        // In a real app, this would open the news article
        window.open(url, '_blank');
    };

    return (
        <div className="news-container">
            <div className="news-header">
                <h2>
                    <FaNewspaper /> Market News
                </h2>
                <div className="news-controls">
                    <div className="search-box">
                        <FaSearch />
                        <input
                            type="text"
                            placeholder="Search news..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-buttons">
                        <FaFilter />
                        {filters.map(f => (
                            <button
                                key={f.value}
                                className={filter === f.value ? 'active' : ''}
                                onClick={() => setFilter(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading && (
                <div className="news-loading">
                    <div className="spinner"></div>
                    <p>Loading latest news...</p>
                </div>
            )}

            {error && (
                <div className="news-error">
                    <p>{error}</p>
                    <button onClick={fetchNews}>Try Again</button>
                </div>
            )}

            {!loading && !error && (
                <div className="news-grid">
                    {filteredNews.length === 0 ? (
                        <div className="no-news">
                            <FaNewspaper />
                            <p>No news found matching your criteria</p>
                        </div>
                    ) : (
                        filteredNews.map(article => (
                            <div key={article.id} className="news-card" onClick={() => handleNewsClick(article.url)}>
                                <div className="news-image">
                                    {article.image ? (
                                        <img 
                                            src={article.image} 
                                            alt={article.title}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.nextElementSibling.style.display = 'block';
                                            }}
                                        />
                                    ) : (
                                        <div 
                                            className="news-image-fallback"
                                            style={{ backgroundColor: article.color }}
                                        >
                                            <div className="fallback-content">
                                                <FaNewspaper />
                                                <span>{article.category}</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="news-category">
                                        <FaTag />
                                        {article.category}
                                    </div>
                                </div>
                                <div className="news-content">
                                    <h3>{article.title}</h3>
                                    <p className="news-summary">{article.summary}</p>
                                    <div className="news-meta">
                                        <span className="news-source">
                                            <FaNewspaper />
                                            {article.source}
                                        </span>
                                        <span className="news-time">
                                            <FaClock />
                                            {formatTimeAgo(article.publishedAt)}
                                        </span>
                                    </div>
                                    <div className="news-actions">
                                        <button className="read-more">
                                            Read More <FaExternalLinkAlt />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default News; 
import styles from './Hero.module.css';

export default function Hero() {
    return (
        <section className={styles.hero}>
            <div className={styles.heroContent}>
                <div className={styles.decorativeShape} style={{ '--delay': '0s' }}></div>
                <div className={styles.decorativeShape} style={{ '--delay': '0.5s' }}></div>
                <div className={styles.decorativeShape} style={{ '--delay': '1s' }}></div>

                <h1 className={styles.heroTitle}>
                    IXL is <span className={styles.highlight}>personalised learning</span>
                </h1>

                <div className={styles.featuresContainer}>
                    <div className={styles.featureCard} style={{ '--card-delay': '0.2s' }}>
                        <div className={styles.featureIcon}>📚</div>
                        <h3 className={styles.featureTitle}>Comprehensive curriculum</h3>
                        <p className={styles.featureText}>Maths • English</p>
                    </div>

                    <div className={styles.featureCard} style={{ '--card-delay': '0.4s' }}>
                        <div className={styles.featureIcon}>✨</div>
                        <h3 className={styles.featureTitle}>Trusted by educators and parents</h3>
                        <p className={styles.featureText}>Over 160 billion questions answered</p>
                    </div>

                    <div className={styles.featureCard} style={{ '--card-delay': '0.6s' }}>
                        <div className={styles.featureIcon}>🎯</div>
                        <h3 className={styles.featureTitle}>Immersive learning experience</h3>
                        <p className={styles.featureText}>Analytics • Standards • Awards</p>
                    </div>
                </div>

                <button className={styles.ctaButton}>
                    Become a member!
                </button>
            </div>
        </section>
    );
}

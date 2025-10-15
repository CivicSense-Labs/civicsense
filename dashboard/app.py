import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import requests
import json
from datetime import datetime, timedelta
import os

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3000')
DEFAULT_ORG_ID = os.getenv('DEFAULT_ORG_ID', 'your-org-id-here')

st.set_page_config(
    page_title="CivicSense Dashboard",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded"
)

@st.cache_data(ttl=60)  # Cache for 1 minute
def fetch_dashboard_data(org_id):
    """Fetch dashboard data from API"""
    try:
        response = requests.get(f"{API_BASE_URL}/dashboard/{org_id}")
        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"API Error: {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        st.error(f"Connection Error: {e}")
        return None

def main():
    st.title("🏛️ CivicSense Dashboard")
    st.markdown("Real-time municipal issue tracking and analytics")

    # Sidebar
    with st.sidebar:
        st.header("Settings")
        org_id = st.text_input("Organization ID", value=DEFAULT_ORG_ID)

        if st.button("🔄 Refresh Data"):
            st.cache_data.clear()

        st.markdown("---")
        st.markdown("### Quick Stats")

    # Fetch data
    data = fetch_dashboard_data(org_id)

    if not data:
        st.error("Unable to load dashboard data. Please check your API connection.")
        return

    metrics = data.get('metrics', {})
    parent_tickets = data.get('parentTickets', [])
    all_tickets = data.get('allTickets', [])
    recent_activity = data.get('recentActivity', [])

    # Key Metrics Row
    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric(
            "Open Parent Tickets",
            metrics.get('open_parent_tickets', 0),
            delta=None
        )

    with col2:
        st.metric(
            "Total Open Issues",
            metrics.get('total_open_tickets', 0),
            delta=None
        )

    with col3:
        st.metric(
            "Merged Duplicates",
            metrics.get('merged_tickets', 0),
            delta=None
        )

    with col4:
        st.metric(
            "Critical Issues",
            metrics.get('critical_open', 0),
            delta=None
        )

    with col5:
        avg_sentiment = metrics.get('avg_sentiment', 0)
        sentiment_color = "normal"
        if avg_sentiment < -0.2:
            sentiment_color = "inverse"
        elif avg_sentiment > 0.2:
            sentiment_color = "normal"

        st.metric(
            "Avg Sentiment",
            f"{avg_sentiment:.2f}" if avg_sentiment else "N/A",
            delta=None
        )

    # Main Content Row
    col1, col2 = st.columns([2, 1])

    with col1:
        st.header("📋 Active Parent Tickets")

        if parent_tickets:
            # Convert to DataFrame for better display
            df_tickets = pd.DataFrame(parent_tickets)

            for ticket in parent_tickets:
                with st.expander(f"🎫 #{ticket['id'][-4:]} - {ticket['category'] or 'Unknown'} ({ticket['child_count']} reports)"):
                    col_a, col_b = st.columns(2)

                    with col_a:
                        st.write(f"**Description:** {ticket['description'][:100]}...")
                        st.write(f"**Location:** {ticket['cross_street'] or 'Not specified'}")
                        st.write(f"**Priority:** {ticket['priority']}")

                    with col_b:
                        st.write(f"**Status:** {ticket['status']}")
                        st.write(f"**Created:** {ticket['created_at'][:10]}")
                        if ticket['sentiment_score']:
                            st.write(f"**Sentiment:** {ticket['sentiment_score']:.2f}")

                    if ticket['child_count'] > 0:
                        st.info(f"This ticket has {ticket['child_count']} merged duplicate reports")
        else:
            st.info("No active parent tickets found")

    with col2:
        st.header("📈 Quick Analytics")

        # Category breakdown
        if all_tickets:
            df_all = pd.DataFrame(all_tickets)
            if 'category' in df_all.columns:
                category_counts = df_all['category'].value_counts()
                fig_pie = px.pie(
                    values=category_counts.values,
                    names=category_counts.index,
                    title="Issues by Category"
                )
                fig_pie.update_traces(textposition='inside', textinfo='percent+label')
                st.plotly_chart(fig_pie, use_container_width=True)

        # Recent activity
        st.header("🕒 Recent Activity")
        if recent_activity:
            for activity in recent_activity[:5]:  # Show last 5 activities
                activity_time = datetime.fromisoformat(activity['activity_time'].replace('Z', '+00:00'))
                time_ago = datetime.now() - activity_time.replace(tzinfo=None)

                if time_ago.days > 0:
                    time_str = f"{time_ago.days}d ago"
                elif time_ago.seconds > 3600:
                    time_str = f"{time_ago.seconds // 3600}h ago"
                else:
                    time_str = f"{time_ago.seconds // 60}m ago"

                st.write(f"**{time_str}**: {activity['activity_type'].replace('_', ' ').title()}")
                st.write(f"_{activity['description'][:80]}..._")
                st.markdown("---")
        else:
            st.info("No recent activity")

    # Bottom Section - Map placeholder and stats
    st.header("🗺️ Geographic Distribution")

    if all_tickets:
        df_geo = pd.DataFrame([t for t in all_tickets if t.get('lat') and t.get('lon')])

        if not df_geo.empty:
            st.map(df_geo[['lat', 'lon']])
        else:
            st.info("No tickets with geographic coordinates available")
    else:
        st.info("No ticket data available for mapping")

    # Performance metrics
    with st.expander("📊 Detailed Analytics"):
        col1, col2, col3 = st.columns(3)

        with col1:
            st.subheader("Today's Activity")
            st.metric("Reports Today", metrics.get('reports_today', 0))
            st.metric("Tickets Created", metrics.get('tickets_today', 0))

        with col2:
            st.subheader("Resolution Stats")
            total_closed = metrics.get('closed_parent_tickets', 0)
            total_open = metrics.get('open_parent_tickets', 0)
            if total_closed + total_open > 0:
                resolution_rate = total_closed / (total_closed + total_open) * 100
                st.metric("Resolution Rate", f"{resolution_rate:.1f}%")

        with col3:
            st.subheader("Efficiency")
            merge_rate = metrics.get('merged_tickets', 0)
            total_reports = metrics.get('total_open_tickets', 0) + metrics.get('total_closed_tickets', 0)
            if total_reports > 0:
                dedup_rate = merge_rate / total_reports * 100
                st.metric("Deduplication Rate", f"{dedup_rate:.1f}%")

    # Auto-refresh
    st.markdown("---")
    st.caption(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Auto-refresh every 60 seconds")

if __name__ == "__main__":
    main()
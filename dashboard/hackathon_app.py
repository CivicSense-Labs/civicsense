#!/usr/bin/env python3
"""
CivicSense Real-time Dashboard - Hackathon MVP
Shows live 311 reports, AI processing, and city metrics
"""

import streamlit as st
import requests
import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import time
from datetime import datetime, timedelta

# Config
API_BASE = "http://localhost:3000"
DEMO_ORG_ID = "f251c99a-05c1-4f81-b00d-e27cd09ca012"

st.set_page_config(
    page_title="CivicSense Dashboard",
    page_icon="🏙️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #1f77b4;
    }
    .urgent-card {
        border-left-color: #ff4b4b !important;
        background-color: #ffe6e6;
    }
    .success-card {
        border-left-color: #00cc88 !important;
        background-color: #e6ffe6;
    }
</style>
""", unsafe_allow_html=True)

def get_dashboard_data():
    """Fetch real-time data from CivicSense API"""
    try:
        response = requests.get(f"{API_BASE}/dashboard/{DEMO_ORG_ID}", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"API Error: {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        st.error(f"Connection Error: {e}")
        return None

def get_organizations():
    """Get list of organizations"""
    try:
        response = requests.get(f"{API_BASE}/organizations", timeout=5)
        if response.status_code == 200:
            return response.json()
        return None
    except:
        return None

def format_priority(priority):
    """Format priority with appropriate emoji"""
    priority_map = {
        'critical': '🚨 Critical',
        'high': '⚠️ High',
        'normal': '📝 Normal',
        'low': '💭 Low'
    }
    return priority_map.get(priority, f"📝 {priority.title()}")

def format_sentiment(score):
    """Format sentiment score with emoji"""
    if score <= -0.5:
        return f"😠 Very Negative ({score:.2f})"
    elif score <= -0.2:
        return f"😕 Negative ({score:.2f})"
    elif score <= 0.2:
        return f"😐 Neutral ({score:.2f})"
    else:
        return f"😊 Positive ({score:.2f})"

# Header
st.title("🏙️ CivicSense Dashboard")
st.markdown("**Real-time AI-powered 311 & Municipal Issue Tracking**")

# Sidebar
st.sidebar.title("📊 Controls")
auto_refresh = st.sidebar.checkbox("Auto-refresh (5s)", value=True)
refresh_button = st.sidebar.button("🔄 Refresh Now")

# Organization selector
orgs_data = get_organizations()
if orgs_data and orgs_data['organizations']:
    org_names = [org['name'] for org in orgs_data['organizations']]
    selected_org = st.sidebar.selectbox("🏢 Organization", org_names, index=0)
else:
    st.sidebar.warning("⚠️ No organizations found")
    selected_org = "Demo City"

st.sidebar.markdown("---")
st.sidebar.markdown("### 🎯 Hackathon MVP Demo")
st.sidebar.info("""
This dashboard shows:
- 📱 Live SMS reports
- 🤖 AI sentiment analysis
- 📍 Location mapping
- 📊 Real-time metrics

Try sending SMS to test!
""")

# Auto-refresh logic
if auto_refresh:
    if 'last_refresh' not in st.session_state:
        st.session_state.last_refresh = time.time()

    if time.time() - st.session_state.last_refresh > 5:
        st.session_state.last_refresh = time.time()
        st.rerun()

# Get data
if refresh_button or auto_refresh or 'dashboard_data' not in st.session_state:
    with st.spinner("🔄 Loading live data..."):
        dashboard_data = get_dashboard_data()
        if dashboard_data:
            st.session_state.dashboard_data = dashboard_data
        time.sleep(0.5)  # Smooth loading

# Display data
if 'dashboard_data' not in st.session_state:
    st.error("❌ Unable to connect to CivicSense API. Make sure the server is running on localhost:3000")
    st.stop()

data = st.session_state.dashboard_data
org = data.get('organization', {})
metrics = data.get('metrics', {})
tickets = data.get('parentTickets', [])
activity = data.get('recentActivity', [])

# Header metrics
st.markdown("### 📈 Live Metrics")
col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    st.metric(
        "🎫 Open Tickets",
        metrics.get('total_open_tickets', 0),
        help="Total number of open issues"
    )

with col2:
    critical = metrics.get('critical_open', 0)
    st.metric(
        "🚨 Critical",
        critical,
        help="Urgent issues requiring immediate attention"
    )

with col3:
    st.metric(
        "📱 Total Reports",
        metrics.get('total_reports', 0),
        help="Number of citizen reports received"
    )

with col4:
    sentiment = metrics.get('avg_sentiment', 0)
    st.metric(
        "😠 Avg Sentiment",
        f"{sentiment:.2f}",
        help="Average citizen sentiment (-1 to 1)"
    )

with col5:
    merged = metrics.get('merged_tickets', 0)
    st.metric(
        "🔗 Merged",
        merged,
        help="Duplicate issues merged by AI"
    )

# Main content area
col_left, col_right = st.columns([2, 1])

with col_left:
    st.markdown("### 🎫 Active Tickets")

    if tickets:
        for ticket in tickets[:10]:  # Show top 10
            priority = ticket.get('priority', 'normal')
            sentiment_score = ticket.get('sentiment_score', 0)

            # Priority-based styling
            card_class = "urgent-card" if priority == 'critical' else "metric-card"

            with st.container():
                st.markdown(f'<div class="{card_class}">', unsafe_allow_html=True)

                col_ticket, col_meta = st.columns([3, 1])

                with col_ticket:
                    st.markdown(f"**Ticket #{ticket['id'][:8]}**")
                    st.markdown(f"📍 {ticket.get('cross_street', 'Location not specified')}")
                    st.markdown(f"💬 {ticket.get('description', 'No description')[:100]}...")

                with col_meta:
                    st.markdown(format_priority(priority))
                    st.markdown(format_sentiment(sentiment_score))
                    st.markdown(f"📅 {ticket.get('created_at', '')[:10]}")

                st.markdown('</div>', unsafe_allow_html=True)
                st.markdown("")

        # Map visualization
        if tickets:
            st.markdown("### 📍 Ticket Locations")

            # Create map data
            map_data = []
            for ticket in tickets:
                if ticket.get('lat') and ticket.get('lon'):
                    map_data.append({
                        'lat': ticket['lat'],
                        'lon': ticket['lon'],
                        'priority': ticket.get('priority', 'normal'),
                        'description': ticket.get('description', '')[:50] + '...',
                        'id': ticket['id'][:8]
                    })

            if map_data:
                df_map = pd.DataFrame(map_data)

                # Color by priority
                color_map = {'critical': 'red', 'high': 'orange', 'normal': 'blue', 'low': 'green'}
                df_map['color'] = df_map['priority'].map(color_map)

                fig = px.scatter_mapbox(
                    df_map,
                    lat='lat',
                    lon='lon',
                    color='priority',
                    hover_data=['id', 'description'],
                    color_discrete_map=color_map,
                    zoom=12,
                    height=400,
                    title="Live Ticket Locations"
                )

                fig.update_layout(
                    mapbox_style="open-street-map",
                    margin={"r":0,"t":30,"l":0,"b":0}
                )

                st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("📭 No active tickets. Try sending a test SMS!")

with col_right:
    st.markdown("### 📊 Quick Stats")

    # Sentiment gauge
    sentiment_val = metrics.get('avg_sentiment', 0)
    fig_gauge = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = sentiment_val,
        domain = {'x': [0, 1], 'y': [0, 1]},
        title = {'text': "Citizen Sentiment"},
        gauge = {
            'axis': {'range': [-1, 1]},
            'bar': {'color': "darkblue"},
            'steps': [
                {'range': [-1, -0.5], 'color': "red"},
                {'range': [-0.5, 0], 'color': "orange"},
                {'range': [0, 0.5], 'color': "yellow"},
                {'range': [0.5, 1], 'color': "green"}
            ],
            'threshold': {
                'line': {'color': "black", 'width': 4},
                'thickness': 0.75,
                'value': sentiment_val
            }
        }
    ))
    fig_gauge.update_layout(height=250, margin=dict(l=20, r=20, t=40, b=20))
    st.plotly_chart(fig_gauge, use_container_width=True)

    # Priority breakdown
    if tickets:
        priority_counts = {}
        for ticket in tickets:
            priority = ticket.get('priority', 'normal')
            priority_counts[priority] = priority_counts.get(priority, 0) + 1

        fig_pie = px.pie(
            values=list(priority_counts.values()),
            names=list(priority_counts.keys()),
            title="Tickets by Priority",
            color_discrete_map={'critical': 'red', 'high': 'orange', 'normal': 'blue', 'low': 'green'}
        )
        fig_pie.update_layout(height=250, margin=dict(l=20, r=20, t=40, b=20))
        st.plotly_chart(fig_pie, use_container_width=True)

    st.markdown("### 📱 Recent Activity")

    if activity:
        for item in activity[:8]:  # Show recent 8
            timestamp = item.get('timestamp', '')[:16].replace('T', ' ')
            activity_type = item.get('type', 'unknown')
            description = item.get('description', 'No description')

            # Icon based on activity type
            icon = "🎫" if activity_type == 'ticket_created' else "📱"

            st.markdown(f"{icon} **{timestamp}**")
            st.markdown(f"   {description}")
            st.markdown("")
    else:
        st.info("📭 No recent activity")

# Footer
st.markdown("---")
col_footer1, col_footer2, col_footer3 = st.columns(3)

with col_footer1:
    st.markdown("**🤖 AI Features:**")
    st.markdown("- Sentiment Analysis ✅")
    st.markdown("- Location Extraction ✅")
    st.markdown("- Priority Classification ✅")

with col_footer2:
    st.markdown("**📊 Data Sources:**")
    st.markdown("- Live SMS Reports ✅")
    st.markdown("- Real-time Database ✅")
    st.markdown("- Location Mapping ✅")

with col_footer3:
    st.markdown(f"**🔄 Last Updated:** {datetime.now().strftime('%H:%M:%S')}")
    st.markdown(f"**🏢 Organization:** {org.get('name', 'Unknown')}")
    st.markdown(f"**📡 API Status:** {'🟢 Connected' if data else '🔴 Disconnected'}")

# Debug section (collapsible)
with st.expander("🔧 Debug Information"):
    st.json({
        "api_base": API_BASE,
        "org_id": DEMO_ORG_ID,
        "data_keys": list(data.keys()) if data else [],
        "ticket_count": len(tickets),
        "activity_count": len(activity)
    })
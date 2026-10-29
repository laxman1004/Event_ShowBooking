import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, jsonBody } from './api.js';

const categories = ['All events', 'Music', 'Technology', 'Business', 'Art', 'Food', 'Community'];
const emptyEventForm = () => ({
  title: '', description: '', date: '', location: '', category: 'Music',
  totalSeats: '', ticketPrice: '', image: '',
});
const localDateTime = (date) => {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const money = (amount) => amount === 0 ? 'Free' : new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(amount || 0);
const eventDate = (date, options = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', options).format(new Date(date));

function App() {
  const [events, setEvents] = useState([]);
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('eventshow-user') || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('eventshow-token'));
  const [bookings, setBookings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [screen, setScreen] = useState('home');
  const [category, setCategory] = useState('All events');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', otp: '' });
  const [pendingEmail, setPendingEmail] = useState('');
  const [bookingOtpSent, setBookingOtpSent] = useState(false);
  const [bookingOtp, setBookingOtp] = useState('');
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState(null);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api('/events');
      setEvents(data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/bookings/my', { token });
      setBookings(data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [token]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { loadBookings(); }, [loadBookings]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCategory = category === 'All events' || event.category === category;
      const matchesSearch = !query || [event.title, event.location, event.description, event.category]
        .some((value) => value?.toLowerCase().includes(query));
      return matchesCategory && matchesSearch && new Date(event.date) >= new Date();
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, category, search]);

  const clearMessages = () => { setError(''); setNotice(''); };
  const showError = (message) => { setNotice(''); setError(message); };
  const showNotice = (message) => { setError(''); setNotice(message); };
  const showRequestError = (requestError) => {
    if (requestError.status === 401) {
      localStorage.removeItem('eventshow-token');
      localStorage.removeItem('eventshow-user');
      setToken(null);
      setUser(null);
      setBookings([]);
      setBookingOtpSent(false);
      setBookingOtp('');
      setScreen('home');
      showError('Your session expired. Please log in again.');
      return;
    }
    if (requestError.status === 403 && requestError.message === 'Not authorized as an admin') {
      showError('Only admin accounts can publish or manage events. Sign in with an admin account.');
      return;
    }
    showError(requestError.message);
  };

  function saveSession(session) {
    const { token: newToken, ...profile } = session;
    localStorage.setItem('eventshow-token', newToken);
    localStorage.setItem('eventshow-user', JSON.stringify(profile));
    setToken(newToken);
    setUser(profile);
    setScreen('home');
    setAuthForm({ name: '', email: '', password: '', otp: '' });
    setPendingEmail('');
    showNotice(`Welcome${profile.name ? `, ${profile.name.split(' ')[0]}` : ''}!`);
  }

  async function submitAuth(event) {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      if (authMode === 'verify') {
        const session = await api('/auth/verify-otp', {
          method: 'POST',
          body: jsonBody({ email: pendingEmail || authForm.email, otp: authForm.otp }),
        });
        saveSession(session);
      } else {
        const session = await api(`/auth/${authMode === 'register' ? 'register' : 'login'}`, {
          method: 'POST',
          body: jsonBody(authMode === 'register'
            ? { name: authForm.name, email: authForm.email, password: authForm.password }
            : { email: authForm.email, password: authForm.password }),
        });
        if (authMode === 'register') {
          setPendingEmail(session.email);
          setAuthMode('verify');
            if (session.developmentCode) {
              setAuthForm((current) => ({ ...current, otp: session.developmentCode }));
              showNotice('Development email is disabled. Your local verification code has been filled in.');
            } else {
              showNotice('Check your email for a verification code.');
            }
          } else {
            saveSession(session);
          }
      }
    } catch (requestError) {
        if (requestError.message === 'Account not verified' || requestError.needsVerification) {
          setPendingEmail(requestError.email || authForm.email);
          setAuthMode('verify');
          if (requestError.developmentCode) {
            setAuthForm((current) => ({ ...current, otp: requestError.developmentCode }));
            showNotice('Development email is disabled. Your local verification code has been filled in.');
            return;
          }
        }
        showRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem('eventshow-token');
    localStorage.removeItem('eventshow-user');
    setToken(null);
    setUser(null);
    setBookings([]);
    setScreen('home');
    setSelected(null);
    showNotice('You have been signed out.');
  }

  async function sendBookingCode() {
    clearMessages();
    setBusy(true);
    try {
      const result = await api('/bookings/send-otp', {
        method: 'POST',
        token,
        body: jsonBody({}),
      });
      setBookingOtpSent(true);
      if (result.developmentCode) {
        setBookingOtp(result.developmentCode);
        showNotice('Development email is disabled. Your local booking code has been filled in.');
      } else {
        showNotice(`A verification code has been sent to ${user.email}.`);
      }
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function bookEvent(event) {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      await api('/bookings', {
        method: 'POST',
        token,
        body: jsonBody({ eventId: selected._id, otp: bookingOtp }),
      });
      setBookingOtp('');
      setBookingOtpSent(false);
      setSelected(null);
      await loadBookings();
      showNotice('Your booking request is in. You can follow its status in My tickets.');
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking(id) {
    clearMessages();
    try {
      await api(`/bookings/${id}`, { method: 'DELETE', token });
      await loadBookings();
      showNotice('Booking cancelled.');
    } catch (requestError) {
      showRequestError(requestError);
    }
  }

  async function confirmBooking(id) {
    clearMessages();
    try {
      const result = await api(`/bookings/${id}/confirm`, {
        method: 'PUT',
        token,
        body: jsonBody({ paymentStatus: 'not_paid' }),
      });
      await loadBookings();
      await loadEvents();
      showNotice(result.message || 'Booking confirmed.');
    } catch (requestError) {
      showRequestError(requestError);
    }
  }

  async function createEvent(event) {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      await api(editingEventId ? `/events/${editingEventId}` : '/events', {
        method: editingEventId ? 'PUT' : 'POST',
        token,
        body: jsonBody({
          ...eventForm,
          totalSeats: Number(eventForm.totalSeats),
          ticketPrice: Number(eventForm.ticketPrice || 0),
        }),
      });
      setEventForm(emptyEventForm());
      setEditingEventId(null);
      await loadEvents();
      showNotice(editingEventId ? 'Your event has been updated.' : 'Your event is live.');
    } catch (requestError) {
      showRequestError(requestError);
    } finally {
      setBusy(false);
    }
  }

  function editEvent(event) {
    setEventForm({
      title: event.title,
      description: event.description,
      date: localDateTime(event.date),
      location: event.location,
      category: event.category,
      totalSeats: String(event.totalSeats),
      ticketPrice: String(event.ticketPrice),
      image: event.image || '',
    });
    setEditingEventId(event._id);
    clearMessages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function stopEditingEvent() {
    setEditingEventId(null);
    setEventForm(emptyEventForm());
  }

  async function deleteEvent(id) {
    if (!window.confirm('Delete this event? This action cannot be undone.')) return;
    clearMessages();
    try {
      await api(`/events/${id}`, { method: 'DELETE', token });
      if (editingEventId === id) stopEditingEvent();
      await loadEvents();
      await loadBookings();
      showNotice('Event deleted.');
    } catch (requestError) {
      showRequestError(requestError);
    }
  }

  function goToAuth(mode = 'login') {
    clearMessages();
    setAuthMode(mode);
    setScreen('auth');
    setSelected(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setScreen('home'); setSelected(null); }} aria-label="EventShow home">
          <span className="brand-mark">E</span><span>event<span className="brand-light">show</span></span>
        </button>
        <nav className="nav-links" aria-label="Main navigation">
          <button className={screen === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => { setScreen('home'); setSelected(null); }}>Discover</button>
          {user && <button className={screen === 'tickets' ? 'nav-link active' : 'nav-link'} onClick={() => { setScreen('tickets'); setSelected(null); }}>My tickets</button>}
          {user?.role === 'admin' && <button className={screen === 'manage' ? 'nav-link active' : 'nav-link'} onClick={() => { setScreen('manage'); setSelected(null); }}>Manage</button>}
        </nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="user-greeting">Hi, {user.name?.split(' ')[0]}</span>
              <button className="button button-outline button-small" onClick={logout}>Sign out</button>
            </>
          ) : (
            <>
              <button className="button button-text button-small" onClick={() => goToAuth('login')}>Log in</button>
              <button className="button button-dark button-small" onClick={() => goToAuth('register')}>Get started <span aria-hidden="true">↗</span></button>
            </>
          )}
        </div>
      </header>

      <main>
        {(error || notice) && (
          <div className={`toast ${error ? 'toast-error' : ''}`} role={error ? 'alert' : 'status'}>
            <span>{error || notice}</span>
            <button onClick={clearMessages} aria-label="Dismiss message">×</button>
          </div>
        )}

        {screen === 'home' && !selected && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow"><span className="eyebrow-dot" /> GOOD THINGS HAPPEN TOGETHER</div>
                <h1>Find your next<br /><span>great moment.</span></h1>
                <p>From live music to big ideas, discover the events worth leaving home for.</p>
                <a className="hero-cta" href="#events" onClick={() => setCategory('All events')}>Explore what’s on <span>↓</span></a>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                <div className="hero-sun">✳</div>
                <div className="hero-note note-one">MAKE<br />A NIGHT<br />OF IT</div>
                <div className="hero-note note-two">GOOD<br />PEOPLE.<br />GOOD TIMES.</div>
                <div className="hero-pill">YOUR CITY, YOUR SCENE <span>✦</span></div>
              </div>
              <div className="hero-index"><span>01</span> / 03 <i /></div>
            </section>

            <section className="events-section" id="events">
              <div className="section-heading">
                <div>
                  <div className="eyebrow eyebrow-muted">THE GOOD STUFF</div>
                  <h2>Events worth your time<span className="accent">.</span></h2>
                </div>
                <span className="event-count">{visibleEvents.length} upcoming {visibleEvents.length === 1 ? 'event' : 'events'}</span>
              </div>
              <div className="event-controls">
                <div className="category-list" role="tablist" aria-label="Filter by category">
                  {categories.map((item) => (
                    <button key={item} role="tab" aria-selected={category === item}
                      className={category === item ? 'category-chip selected' : 'category-chip'}
                      onClick={() => setCategory(item)}>{item}</button>
                  ))}
                </div>
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events or places" aria-label="Search events or places" />
                  {search && <button onClick={() => setSearch('')} aria-label="Clear search">×</button>}
                </label>
              </div>

              {visibleEvents.length ? (
                <div className="event-grid">
                  {visibleEvents.map((event, index) => (
                    <article className="event-card" key={event._id}>
                      <button className="event-image-button" onClick={() => { clearMessages(); setSelected(event); }} aria-label={`View ${event.title}`}>
                        <div className={`event-image image-tone-${index % 4}`} style={event.image ? { backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(12,18,24,.46)), url("${event.image}")` } : undefined}>
                          {!event.image && <span className="image-glyph">{event.category === 'Music' ? '♫' : event.category === 'Technology' ? '⌘' : event.category === 'Art' ? '✳' : '✦'}</span>}
                          <span className="image-category">{event.category}</span>
                          <span className="image-date">{eventDate(event.date, { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </button>
                      <div className="event-card-body">
                        <div className="event-card-meta"><span>{eventDate(event.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="meta-dot">·</span><span>{event.location}</span></div>
                        <button className="event-title" onClick={() => { clearMessages(); setSelected(event); }}>{event.title}</button>
                        <div className="event-card-bottom"><span className="event-price">{money(event.ticketPrice)}</span><button className="arrow-button" onClick={() => { clearMessages(); setSelected(event); }} aria-label={`Details for ${event.title}`}>↗</button></div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state"><span className="empty-icon">✳</span><h3>No events found just yet</h3><p>Try a different search or category. Your next great plan is out there.</p><button className="button button-outline" onClick={() => { setSearch(''); setCategory('All events'); }}>Clear filters</button></div>
              )}
            </section>
            <section className="closing-banner"><div><span className="eyebrow">GOT SOMETHING TO SHARE?</span><h2>Bring your people<br />together.</h2></div><p>Make your next gathering one people remember. Create an event and let your community find you.</p>{user?.role === 'admin' ? <button className="button button-light" onClick={() => setScreen('manage')}>Create an event <span>↗</span></button> : <button className="button button-light" onClick={() => goToAuth('register')}>Join EventShow <span>↗</span></button>}</section>
          </>
        )}

        {screen === 'auth' && (
          <section className="auth-page">
            <div className="auth-art"><span className="auth-art-tag">MAKE ROOM<br />FOR A LITTLE<br /><em>WONDER.</em></span><span className="auth-art-spark">✳</span><span className="auth-art-caption">THERE'S ALWAYS SOMETHING HAPPENING.</span></div>
            <div className="auth-panel">
              <div className="eyebrow eyebrow-muted">{authMode === 'register' ? 'YOUR NEXT CHAPTER' : authMode === 'verify' ? 'ONE QUICK CHECK' : 'WELCOME BACK'}</div>
              <h1>{authMode === 'register' ? 'Let’s get you out there.' : authMode === 'verify' ? 'Verify your email.' : 'Good to see you.'}</h1>
              <p>{authMode === 'verify' ? `Enter the 6-digit code we sent to ${pendingEmail || authForm.email}.` : authMode === 'register' ? 'Create an account to find, book, and keep track of the things you love.' : 'Log in to pick up where the good times left off.'}</p>
              <form className="form-stack" onSubmit={submitAuth}>
                {authMode === 'register' && <label>Your name<input autoComplete="name" required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Alex Morgan" /></label>}
                {authMode !== 'verify' && <label>Email address<input type="email" autoComplete="email" required value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@example.com" /></label>}
                {authMode !== 'verify' && <label>Password<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required minLength="8" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="At least 8 characters" /></label>}
                {authMode === 'verify' && <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required value={authForm.otp} onChange={(event) => setAuthForm({ ...authForm, otp: event.target.value.replace(/\D/g, '') })} placeholder="000000" /></label>}
                <button className="button button-dark button-wide" disabled={busy}>{busy ? 'Just a moment…' : authMode === 'verify' ? 'Verify and continue' : authMode === 'register' ? 'Create account' : 'Log in'} <span>↗</span></button>
              </form>
              <div className="auth-switch">{authMode === 'verify' ? <button onClick={() => { setAuthMode('login'); setAuthForm({ ...authForm, otp: '' }); }}>Back to log in</button> : authMode === 'register' ? <>Already have an account? <button onClick={() => setAuthMode('login')}>Log in</button></> : <>New around here? <button onClick={() => setAuthMode('register')}>Create an account</button></>}</div>
            </div>
          </section>
        )}

        {selected && screen === 'home' && (
          <section className="detail-page">
            <button className="back-link" onClick={() => { setSelected(null); setBookingOtpSent(false); setBookingOtp(''); }}>← Back to all events</button>
            <div className="detail-layout">
              <div className="detail-visual" style={selected.image ? { backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(12,18,24,.55)), url("${selected.image}")` } : undefined}>
                {!selected.image && <span className="image-glyph">{selected.category === 'Music' ? '♫' : '✳'}</span>}
                <span className="image-category">{selected.category}</span>
              </div>
              <div className="detail-copy">
                <div className="eyebrow eyebrow-muted">{eventDate(selected.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <h1>{selected.title}</h1>
                <div className="detail-location"><span>⌖</span> {selected.location}</div>
                <p className="detail-description">{selected.description}</p>
                <div className="detail-facts"><div><span>WHEN</span><strong>{eventDate(selected.date, { month: 'long', day: 'numeric' })}</strong></div><div><span>TICKETS</span><strong>{money(selected.ticketPrice)}</strong></div><div><span>AVAILABLE</span><strong>{selected.availableSeats} spots</strong></div></div>
                {user ? (
                  selected.availableSeats > 0 ? (
                    <form className="booking-box" onSubmit={bookEvent}>
                      {!bookingOtpSent ? <><p>Ready to make a plan? We’ll send you a quick code to verify your booking.</p><button type="button" className="button button-dark button-wide" disabled={busy} onClick={sendBookingCode}>Reserve your spot <span>↗</span></button></> :
                        <><label>Enter the code sent to {user.email}<input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required value={bookingOtp} onChange={(event) => setBookingOtp(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /></label><button className="button button-dark button-wide" disabled={busy}>{busy ? 'Booking…' : 'Confirm booking request'} <span>↗</span></button></>}
                    </form>
                  ) : <div className="sold-out">This event is fully booked.</div>
                ) : <div className="booking-box"><p>Sign in to book your place at this event.</p><button className="button button-dark button-wide" onClick={() => goToAuth('login')}>Log in to book <span>↗</span></button></div>}
              </div>
            </div>
          </section>
        )}

        {screen === 'tickets' && (
          <section className="dashboard-page">
            <div className="dashboard-heading"><div className="eyebrow eyebrow-muted">YOUR PLANS, ALL IN ONE PLACE</div><h1>My tickets<span className="accent">.</span></h1><p>Every good plan starts somewhere. Here’s what you’ve got coming up.</p></div>
            {bookings.length ? <div className="booking-list">{bookings.map((booking) => <BookingCard key={booking._id} booking={booking} onCancel={cancelBooking} admin={false} />)}</div> : <div className="empty-state"><span className="empty-icon">✳</span><h3>Your next great story starts here</h3><p>You haven’t booked any events yet. Take a look around.</p><button className="button button-dark" onClick={() => setScreen('home')}>Explore events <span>↗</span></button></div>}
          </section>
        )}

        {screen === 'manage' && user?.role === 'admin' && (
          <section className="dashboard-page">
            <div className="dashboard-heading"><div className="eyebrow eyebrow-muted">EVENTSHOW ADMIN</div><h1>Make it happen<span className="accent">.</span></h1><p>Create a new event or look after the bookings coming in.</p></div>
            <div className="admin-layout">
              <form className="admin-form" onSubmit={createEvent}>
                <h2>{editingEventId ? 'Edit event' : 'Create an event'}</h2>
                <label>Event name<input required minLength="3" value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} placeholder="A night to remember" /></label>
                <label>Description<textarea required rows="4" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} placeholder="Tell people what makes it special…" /></label>
                <div className="form-row"><label>Date and time<input type="datetime-local" required value={eventForm.date} onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })} /></label><label>Category<select value={eventForm.category} onChange={(event) => setEventForm({ ...eventForm, category: event.target.value })}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label></div>
                <label>Location<input required value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} placeholder="Venue, city" /></label>
                <div className="form-row"><label>Ticket price (USD)<input type="number" min="0" step="1" value={eventForm.ticketPrice} onChange={(event) => setEventForm({ ...eventForm, ticketPrice: event.target.value })} placeholder="0 for free" /></label><label>Places available<input type="number" min="1" required value={eventForm.totalSeats} onChange={(event) => setEventForm({ ...eventForm, totalSeats: event.target.value })} placeholder="100" /></label></div>
                <label>Image URL <span className="optional">(optional)</span><input type="url" value={eventForm.image} onChange={(event) => setEventForm({ ...eventForm, image: event.target.value })} placeholder="https://…" /></label>
                <button className="button button-dark button-wide" disabled={busy}>{busy ? 'Saving…' : editingEventId ? 'Save changes' : 'Publish event'} <span>↗</span></button>
                {editingEventId && <button type="button" className="cancel-link" onClick={stopEditingEvent}>Cancel editing</button>}
              </form>
              <div className="admin-bookings"><div className="admin-list-heading"><h2>Booking requests</h2><span>{bookings.filter((booking) => booking.status === 'pending').length} pending</span></div>
                {bookings.length ? bookings.map((booking) => <BookingCard key={booking._id} booking={booking} onCancel={cancelBooking} onConfirm={confirmBooking} admin />) : <div className="admin-empty">New bookings will show up here.</div>}
                <h2 className="manage-events-title">Your events</h2>
                {events.map((event) => <div className="manage-event-row" key={event._id}><div><strong>{event.title}</strong><span>{eventDate(event.date)} · {event.availableSeats}/{event.totalSeats} places left</span></div><div className="manage-event-controls"><button className="edit-link" onClick={() => editEvent(event)}>Edit</button><button className="delete-link" onClick={() => deleteEvent(event._id)}>Delete</button></div></div>)}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer"><button className="brand footer-brand" onClick={() => { setScreen('home'); setSelected(null); }}><span className="brand-mark">E</span><span>event<span className="brand-light">show</span></span></button><span>Make time for the things that bring us together.</span><span>© {new Date().getFullYear()} EventShow</span></footer>
    </div>
  );
}

function BookingCard({ booking, admin, onCancel, onConfirm }) {
  const event = booking.eventId || {};
  const attendee = booking.userId;
  return (
    <article className="booking-card">
      <div className="booking-date"><strong>{event.date ? eventDate(event.date, { month: 'short', day: '2-digit' }).split(' ')[1] : '—'}</strong><span>{event.date ? eventDate(event.date, { month: 'short' }).toUpperCase() : ''}</span></div>
      <div className="booking-info"><h3>{event.title || 'Event removed'}</h3><p>{event.location || '—'}{admin && attendee ? ` · ${attendee.name} (${attendee.email})` : ''}</p><div className="booking-meta"><span>{money(booking.amount)}</span><span className={`status-badge status-${booking.status}`}>{booking.status}</span><span className={`payment-badge payment-${booking.paymentStatus}`}>{booking.paymentStatus === 'paid' ? 'Paid' : 'Payment due'}</span></div></div>
      <div className="booking-actions">{admin && booking.status === 'pending' && <button className="button button-dark button-small" onClick={() => onConfirm(booking._id)}>Confirm</button>}{booking.status !== 'cancelled' && <button className="cancel-link" onClick={() => onCancel(booking._id)}>{admin ? 'Cancel' : 'Cancel booking'}</button>}</div>
    </article>
  );
}

export default App;

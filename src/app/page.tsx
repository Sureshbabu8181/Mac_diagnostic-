"use client";

import { useState } from "react";
import { BedDouble, Building2, ChevronRight, Home, Mail, MapPin, Menu, Phone, ShieldCheck, Star, Users, Utensils, Wifi, X } from "lucide-react";

const rooms = [
  { name: "Single Room", price: "₹9,500/mo", desc: "Private room with attached bathroom, study table, and wardrobe. Perfect for professionals.", features: ["Attached Bathroom", "Study Table", "Wardrobe", "Wi-Fi"], img: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=600&h=400&fit=crop" },
  { name: "Double Sharing", price: "₹6,500/mo", desc: "Spacious room for two with shared amenities. Ideal for students and colleagues.", features: ["Shared Bathroom", "Bunk Beds", "Study Area", "Wi-Fi"], img: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop" },
  { name: "Triple Sharing", price: "₹5,000/mo", desc: "Affordable triple-sharing room with all essential amenities included.", features: ["Almirah", "Study Desk", "Fan/AC", "Wi-Fi"], img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop" },
  { name: "Dormitory", price: "₹3,500/mo", desc: "Budget-friendly dormitory beds with common area and locker facility.", features: ["Personal Locker", "Common Room", "24/7 Security", "Wi-Fi"], img: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&h=400&fit=crop" },
];

const reviews = [
  { name: "Rahul Sharma", text: "Best PG in the area! Clean rooms, great food, and very cooperative staff. Highly recommend for working professionals.", rating: 5, role: "Software Engineer" },
  { name: "Priya Patel", text: "Been staying here for 6 months. The facilities are excellent and the location is very convenient. Feel like home!", rating: 5, role: "Designer" },
  { name: "Amit Verma", text: "Great value for money. The mess food is tasty and the rooms are well maintained. Security is top notch.", rating: 4, role: "Student" },
  { name: "Sneha Reddy", text: "Switched from another PG to this and it's been a great experience. Cleanliness and hygiene are priorities here.", rating: 5, role: "Doctor" },
];

const services = [
  { icon: Wifi, title: "High-Speed Wi-Fi", desc: "Stay connected with dedicated high-speed internet throughout the property." },
  { icon: Utensils, title: "Healthy Meals", desc: "Freshly prepared vegetarian and non-vegetarian meals served three times a day." },
  { icon: ShieldCheck, title: "24/7 Security", desc: "Round-the-clock security with CCTV surveillance and secure access system." },
  { icon: Home, title: "Fully Furnished", desc: "All rooms come with beds, wardrobes, study tables, and essential furniture." },
  { icon: Users, title: "Community Events", desc: "Regular social events and gatherings to build a friendly community atmosphere." },
  { icon: Building2, title: "Prime Location", desc: "Located close to IT hubs, colleges, hospitals, and public transport." },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setForm({ name: "", phone: "", email: "", message: "" });
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* NAVBAR */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900">
              <BedDouble size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Sunrise PG</span>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#rooms" className="text-sm font-medium text-slate-600 hover:text-slate-900">Rooms</a>
            <a href="#services" className="text-sm font-medium text-slate-600 hover:text-slate-900">Services</a>
            <a href="#reviews" className="text-sm font-medium text-slate-600 hover:text-slate-900">Reviews</a>
            <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-slate-900">Contact</a>
            <a href="#enquiry" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">Enquire Now</a>
            <a href="/dashboard" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Login</a>
          </div>
          <button className="rounded-md p-2 hover:bg-slate-100 md:hidden" onClick={() => setMenuOpen(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
        </div>
        {menuOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)}>
            <div className="ml-auto h-full w-72 bg-white p-6" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex justify-end">
                <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => setMenuOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <a href="#rooms" className="text-sm font-medium text-slate-700" onClick={() => setMenuOpen(false)}>Rooms</a>
                <a href="#services" className="text-sm font-medium text-slate-700" onClick={() => setMenuOpen(false)}>Services</a>
                <a href="#reviews" className="text-sm font-medium text-slate-700" onClick={() => setMenuOpen(false)}>Reviews</a>
                <a href="#contact" className="text-sm font-medium text-slate-700" onClick={() => setMenuOpen(false)}>Contact</a>
                <a href="#enquiry" className="rounded-full bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white" onClick={() => setMenuOpen(false)}>Enquire Now</a>
                <a href="/dashboard" className="rounded-full border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700" onClick={() => setMenuOpen(false)}>Login</a>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:flex-row lg:pt-24">
          <div className="flex-1 text-center lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/70 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Premium PG Accommodation
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Your <span className="text-emerald-400">Home Away</span>
              <br />
              From Home
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
              Sunrise PG offers premium, fully-furnished accommodations with modern amenities, delicious meals, and a vibrant community — perfect for students and working professionals.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4 justify-center lg:justify-start">
              <a href="#enquiry" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 hover:shadow-xl">
                Book a Visit <ChevronRight size={16} />
              </a>
              <a href="#rooms" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                View Rooms
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 justify-center lg:justify-start">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 w-8 rounded-full border-2 border-slate-700 bg-slate-600" />
                ))}
              </div>
              <p className="text-sm text-white/50">
                <span className="font-semibold text-white">50+</span> happy residents
              </p>
            </div>
          </div>
          <div className="flex-1">
            <div className="relative">
              <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-blue-500/20 blur-xl" />
              <img
                src="https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=700&h=500&fit=crop"
                alt="PG Building"
                className="relative rounded-2xl object-cover shadow-2xl"
              />
              <div className="absolute -bottom-4 -left-4 rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur-lg">
                <p className="text-2xl font-bold text-white">4.8</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-xs text-white/60">Avg. Rating</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROOMS */}
      <section id="rooms" className="scroll-mt-16 bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-600">Our Rooms</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Choose Your Space</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-500">From private singles to budget-friendly dorms, find the perfect room that suits your needs and budget.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.map((room) => (
              <div key={room.name} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div className="relative h-48 overflow-hidden">
                  <img src={room.img} alt={room.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <p className="absolute bottom-3 left-3 text-lg font-bold text-white">{room.price}</p>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-slate-900">{room.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{room.desc}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {room.features.map((f) => (
                      <span key={f} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-600">What We Offer</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Premium Amenities</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-500">Everything you need for a comfortable and convenient living experience.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div key={s.title} className="group rounded-xl border border-slate-200 p-6 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-200">
                  <s.icon size={24} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" className="scroll-mt-16 bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-600">Testimonials</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">What Residents Say</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {reviews.map((r) => (
              <div key={r.name} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex gap-1">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={14} className="fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-sm leading-relaxed text-slate-600">&ldquo;{r.text}&rdquo;</p>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ENQUIRY + CONTACT */}
      <section id="enquiry" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-600">Get In Touch</p>
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Send Us an Enquiry</h2>
              <p className="mt-3 text-slate-500">Have questions? Fill out the form and we&apos;ll get back to you within 24 hours.</p>
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <MapPin size={16} className="text-emerald-600 shrink-0" />
                  123 Sunrise Avenue, Near Tech Park, Bengaluru 560001
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Phone size={16} className="text-emerald-600 shrink-0" />
                  +91 98765 43210
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Mail size={16} className="text-emerald-600 shrink-0" />
                  hello@sunrisepg.in
                </div>
              </div>
            </div>
            <div>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="name">Name</label>
                    <input id="name" className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="phone">Phone</label>
                    <input id="phone" className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Your phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="email">Email</label>
                  <input id="email" type="email" className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="your@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="message">Message</label>
                  <textarea id="message" rows={4} className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none" placeholder="Tell us about your requirements..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
                </div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                  {submitted ? "Sent! We'll contact you soon." : "Submit Enquiry"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="contact" className="scroll-mt-16 border-t border-slate-200 bg-slate-900 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <BedDouble size={16} className="text-emerald-400" />
                </div>
                <span className="font-semibold text-white">Sunrise PG</span>
              </div>
              <p className="text-sm text-white/50">Premium PG accommodation for students and working professionals. Your home away from home.</p>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-white">Quick Links</p>
              <div className="flex flex-col gap-2 text-sm text-white/50">
                <a href="#rooms" className="hover:text-white">Rooms</a>
                <a href="#services" className="hover:text-white">Services</a>
                <a href="#reviews" className="hover:text-white">Reviews</a>
                <a href="/dashboard" className="hover:text-white">Admin Login</a>
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-white">Contact</p>
              <div className="flex flex-col gap-2 text-sm text-white/50">
                <p>123 Sunrise Avenue, Bengaluru</p>
                <p>+91 98765 43210</p>
                <p>hello@sunrisepg.in</p>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-white/10 pt-8 text-center text-xs text-white/30">
            &copy; {new Date().getFullYear()} Sunrise PG. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

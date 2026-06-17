"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Users, BarChart3, Plus, Settings, Landmark, Sparkles } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/bank", label: "Bank", icon: Landmark },
  { href: "/summary", label: "Tax Summary", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-700 text-lg">
          <FileText size={20} />
          InvoiceApp
        </Link>
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
          <Link
            href="/invoices/new"
            className="ml-3 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            New Invoice
          </Link>
        </div>
      </div>
    </nav>
  );
}

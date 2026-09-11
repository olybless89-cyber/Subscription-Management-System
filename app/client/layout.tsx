import { CustomerAuthProvider } from '../_components/CustomerAuthProvider';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <CustomerAuthProvider>{children}</CustomerAuthProvider>;
}

import { Header } from './components/Header';
import { Capabilities } from './sections/Capabilities';
import { DocsCallout } from './sections/DocsCallout';
import { Footer } from './sections/Footer';
import { Hero } from './sections/Hero';
import { Trust } from './sections/Trust';
import { Workflow } from './sections/Workflow';

export default function App() {
  return (
    <>
      <Header />
      <Hero />
      <Workflow />
      <Capabilities />
      <Trust />
      <DocsCallout />
      <Footer />
    </>
  );
}

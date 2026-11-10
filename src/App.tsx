import { useEffect } from 'react';
import { Dialogs } from './components/Dialogs';
import { Toasts } from './components/Controls';
import { Cinematic } from './editor/Cinematic';
import { EditorScreen } from './editor/EditorScreen';
import { Home } from './screens/Home';
import { Studios } from './screens/Studios';
import { MinecraftGuiStudio } from './studios/MinecraftGuiStudio';
import { PackStudio } from './studios/PackStudio';
import { CreatorStudio } from './studios/CreatorStudio';
import { SceneStudio } from './studios/SceneStudio';
import { Opening } from './screens/Opening';
import { hasSeenOpening } from './lib/opening';
import { PaletteLibrary } from './screens/PaletteLibrary';
import { Playground } from './screens/Playground';
import { TilesetStudio } from './screens/TilesetStudio';
import { Showcase } from './screens/Showcase';
import { Settings } from './screens/Settings';
import { Docs } from './screens/Docs';
import { useUi } from './store/ui';
import { useEditor } from './store/project';
import { openSharedProject, openStoredProject } from './editor/projectActions';
import { projectIdFromSearch, stripProjectParam } from './lib/session';
import { shareTokenFromLocation, stripShareParam } from './lib/share';

export default function App() {
  const screen = useUi((s) => s.screen);

  useEffect(() => {
    // A share link carries a whole project; import it and clean the URL so a reload is a no-op.
    const shareToken = shareTokenFromLocation(window.location.search, window.location.hash);
    // A `?project=` link belongs to its own tab: load that document and leave every other tab alone.
    const linkedProject = projectIdFromSearch(window.location.search);
    if (shareToken) {
      void openSharedProject(shareToken).finally(stripShareParam);
    } else if (linkedProject) {
      void openStoredProject(linkedProject).finally(stripProjectParam);
    } else if (!hasSeenOpening()) {
      // First visit: the opening scene plays, then the onboarding tour (both are optional, both are
      // one-shot). A repeat visit goes straight to the studio.
      useUi.getState().setOpeningOpen(true);
    } else if (!localStorage.getItem('pixelarium.onboarded')) {
      useUi.getState().openDialog('onboarding');
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const { saveStatus } = useEditor.getState();
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <>
      {screen === 'home' && <Home />}
      {screen === 'studios' && <Studios />}
      {screen === 'gui' && <MinecraftGuiStudio />}
      {screen === 'packs' && <PackStudio />}
      {screen === 'creator' && <CreatorStudio />}
      {screen === 'scene' && <SceneStudio />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'palettes' && <PaletteLibrary />}
      {screen === 'playground' && <Playground />}
      {screen === 'tileset' && <TilesetStudio />}
      {screen === 'showcase' && <Showcase />}
      {screen === 'settings' && <Settings />}
      {screen === 'docs' && <Docs />}
      <Dialogs />
      <Cinematic />
      <Opening />
      <Toasts />
    </>
  );
}

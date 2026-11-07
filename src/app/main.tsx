import { render } from 'preact';
import { App } from '../ui/App';
import '../ui/style.css';
import { registerSavedPeoples } from './peoples';

registerSavedPeoples(); // made-up peoples from the save slots (F-208)

render(<App />, document.getElementById('app')!);

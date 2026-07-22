// FORMATION-EVALUATION — Éditeur inline (Questionnaire OU Rendus) d'une formation.
// Édition entièrement inline (pas de popup). Réordonnancement par boutons ↑/↓ (convention : pas de
// dépendance DnD lourde). Les deux onglets partagent le cache TanStack → un enregistrement depuis
// l'un préserve l'autre.
import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState, Button, FormField, TextInput, TextArea, Checkbox } from '@bs/ui';
import type { EvalSection, EvalQuestion, EvalDeliverable } from '@bs/api-client';
import { useEvaluationDefinition, useEvaluationDefinitionSave } from './useEvaluation';
import './evaluation.css';

let TMP = 0;
const tmpId = () => `tmp-${Date.now()}-${TMP++}`;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function EvaluationEditor({ formationId, part }: { formationId: string; part: 'questionnaire' | 'deliverables' }) {
  const query = useEvaluationDefinition(formationId);
  const save = useEvaluationDefinitionSave(formationId);

  const [active, setActive] = useState(false);
  const [sections, setSections] = useState<EvalSection[]>([]);
  const [deliverables, setDeliverables] = useState<EvalDeliverable[]>([]);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (query.data) {
      setActive(query.data.active);
      setSections(query.data.sections || []);
      setDeliverables(query.data.deliverables || []);
    }
  }, [query.data]);

  const onSave = () => {
    // Fusionne avec la partie non éditée (cache partagé garantit la cohérence).
    save.mutate(
      { active, sections, deliverables },
      { onSuccess: () => setSavedAt(Date.now()) }
    );
  };

  const dirty = useMemo(() => {
    if (!query.data) return false;
    return JSON.stringify({ active, sections, deliverables }) !== JSON.stringify({ active: query.data.active, sections: query.data.sections, deliverables: query.data.deliverables });
  }, [active, sections, deliverables, query.data]);

  if (query.status === 'pending') return <LoadingState label="Chargement…" />;
  if (query.status === 'error') return <ErrorState title="Impossible de charger l'évaluation." />;

  return (
    <div className="ev-editor">
      {part === 'questionnaire' ? (
        <>
          <label className="ev-editor__active">
            <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Évaluation active (visible par le client)</span>
          </label>
          <QuestionnaireEditor sections={sections} onChange={setSections} />
        </>
      ) : (
        <DeliverablesEditor deliverables={deliverables} onChange={setDeliverables} />
      )}

      <div className="ev-editor__bar">
        <Button type="button" disabled={!dirty || save.isPending} onClick={onSave}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {savedAt > 0 && !dirty ? <span className="ev-editor__saved">Enregistré.</span> : null}
        {save.isError ? <span className="ev-error">Échec de l'enregistrement.</span> : null}
      </div>
    </div>
  );
}

function QuestionnaireEditor({ sections, onChange }: { sections: EvalSection[]; onChange: (s: EvalSection[]) => void }) {
  const patch = (i: number, next: Partial<EvalSection>) => onChange(sections.map((s, k) => (k === i ? { ...s, ...next } : s)));
  const addSection = () => onChange([...sections, { _id: tmpId(), title: 'Nouvelle section', description: '', order: sections.length, questions: [] }]);

  return (
    <div className="ev-sections">
      {sections.map((section, si) => (
        <div key={section._id || si} className="ev-card">
          <div className="ev-card__head">
            <input className="ev-inline-title" value={section.title} onChange={(e) => patch(si, { title: e.target.value })} placeholder="Titre de la section" />
            <div className="ev-reorder">
              <button type="button" aria-label="Monter" onClick={() => onChange(move(sections, si, -1))}>↑</button>
              <button type="button" aria-label="Descendre" onClick={() => onChange(move(sections, si, 1))}>↓</button>
              <button type="button" aria-label="Supprimer" className="ev-del" onClick={() => onChange(sections.filter((_, k) => k !== si))}>✕</button>
            </div>
          </div>
          <TextInput value={section.description || ''} onChange={(e) => patch(si, { description: e.target.value })} placeholder="Description (optionnelle)" />
          <QuestionsEditor questions={section.questions} onChange={(q) => patch(si, { questions: q })} />
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={addSection}>+ Ajouter une section</Button>
    </div>
  );
}

function QuestionsEditor({ questions, onChange }: { questions: EvalQuestion[]; onChange: (q: EvalQuestion[]) => void }) {
  const patch = (i: number, next: Partial<EvalQuestion>) => onChange(questions.map((q, k) => (k === i ? { ...q, ...next } : q)));
  const addTF = () => onChange([...questions, { _id: tmpId(), type: 'true_false', prompt: '', required: true, correctBoolean: true, order: questions.length }]);
  const addQuiz = () => onChange([...questions, { _id: tmpId(), type: 'quiz', prompt: '', required: true, mode: 'single', order: questions.length, answers: [{ _id: tmpId(), text: '', correct: true, order: 0 }, { _id: tmpId(), text: '', correct: false, order: 1 }] }]);

  return (
    <div className="ev-questions">
      {questions.map((q, qi) => (
        <div key={q._id || qi} className="ev-q-edit">
          <div className="ev-q-edit__row">
            <span className="ev-q-type">{q.type === 'true_false' ? 'Vrai/Faux' : `Quiz ${q.mode === 'multiple' ? 'multi' : 'mono'}`}</span>
            <div className="ev-reorder">
              <button type="button" aria-label="Monter" onClick={() => onChange(move(questions, qi, -1))}>↑</button>
              <button type="button" aria-label="Descendre" onClick={() => onChange(move(questions, qi, 1))}>↓</button>
              <button type="button" aria-label="Supprimer" className="ev-del" onClick={() => onChange(questions.filter((_, k) => k !== qi))}>✕</button>
            </div>
          </div>
          <TextInput value={q.prompt} onChange={(e) => patch(qi, { prompt: e.target.value })} placeholder="Énoncé de la question" />
          <label className="ev-req"><Checkbox checked={q.required} onChange={(e) => patch(qi, { required: e.target.checked })} /> Obligatoire</label>

          {q.type === 'true_false' ? (
            <label className="ev-req"><Checkbox checked={Boolean(q.correctBoolean)} onChange={(e) => patch(qi, { correctBoolean: e.target.checked })} /> Bonne réponse : Vrai</label>
          ) : (
            <>
              <label className="ev-req">
                <select value={q.mode} onChange={(e) => patch(qi, { mode: e.target.value as 'single' | 'multiple' })}>
                  <option value="single">Mono-réponse</option>
                  <option value="multiple">Multi-réponses</option>
                </select>
              </label>
              <div className="ev-answers">
                {(q.answers || []).map((a, ai) => (
                  <div key={a._id || ai} className="ev-answer">
                    <input className="ev-answer__text" value={a.text} onChange={(e) => patch(qi, { answers: (q.answers || []).map((x, k) => (k === ai ? { ...x, text: e.target.value } : x)) })} placeholder={`Réponse ${ai + 1}`} />
                    <label className="ev-answer__ok"><input type="checkbox" checked={a.correct} onChange={(e) => patch(qi, { answers: (q.answers || []).map((x, k) => (k === ai ? { ...x, correct: e.target.checked } : x)) })} /> juste</label>
                    <button type="button" aria-label="Supprimer" className="ev-del" onClick={() => patch(qi, { answers: (q.answers || []).filter((_, k) => k !== ai) })}>✕</button>
                  </div>
                ))}
                <button type="button" className="ev-add-answer" onClick={() => patch(qi, { answers: [...(q.answers || []), { _id: tmpId(), text: '', correct: false, order: (q.answers || []).length }] })}>+ réponse</button>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="ev-q-add">
        <button type="button" onClick={addTF}>+ Vrai/Faux</button>
        <button type="button" onClick={addQuiz}>+ Quiz</button>
      </div>
    </div>
  );
}

function DeliverablesEditor({ deliverables, onChange }: { deliverables: EvalDeliverable[]; onChange: (d: EvalDeliverable[]) => void }) {
  const patch = (i: number, next: Partial<EvalDeliverable>) => onChange(deliverables.map((d, k) => (k === i ? { ...d, ...next } : d)));
  const addPhoto = () => onChange([...deliverables, { _id: tmpId(), type: 'photo_before_after', title: 'Photo avant / après', description: '', required: true, order: deliverables.length }]);
  const addVideo = () => onChange([...deliverables, { _id: tmpId(), type: 'video', title: 'Vidéo', description: '', required: true, order: deliverables.length, maxDurationSeconds: 120 }]);

  return (
    <div className="ev-deliverables-edit">
      {deliverables.map((d, di) => (
        <div key={d._id || di} className="ev-card">
          <div className="ev-card__head">
            <span className="ev-q-type">{d.type === 'photo_before_after' ? 'Photo avant/après' : 'Vidéo'}</span>
            <div className="ev-reorder">
              <button type="button" aria-label="Monter" onClick={() => onChange(move(deliverables, di, -1))}>↑</button>
              <button type="button" aria-label="Descendre" onClick={() => onChange(move(deliverables, di, 1))}>↓</button>
              <button type="button" aria-label="Supprimer" className="ev-del" onClick={() => onChange(deliverables.filter((_, k) => k !== di))}>✕</button>
            </div>
          </div>
          <TextInput value={d.title} onChange={(e) => patch(di, { title: e.target.value })} placeholder="Titre du rendu" />
          <TextArea value={d.description || ''} onChange={(e) => patch(di, { description: e.target.value })} placeholder="Description (optionnelle)" rows={2} />
          <label className="ev-req"><Checkbox checked={d.required} onChange={(e) => patch(di, { required: e.target.checked })} /> Obligatoire</label>
          {d.type === 'video' ? (
            <FormField label="Durée maximale (secondes)">
              <TextInput type="number" value={String(d.maxDurationSeconds ?? '')} onChange={(e) => patch(di, { maxDurationSeconds: e.target.value ? Number(e.target.value) : null })} />
            </FormField>
          ) : null}
        </div>
      ))}
      <div className="ev-q-add">
        <button type="button" onClick={addPhoto}>+ Photo avant/après</button>
        <button type="button" onClick={addVideo}>+ Vidéo</button>
      </div>
    </div>
  );
}

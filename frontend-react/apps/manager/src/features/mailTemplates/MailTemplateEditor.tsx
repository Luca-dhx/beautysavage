// M6 — Éditeur d'un template e-mail : charge le publié, édite un brouillon, preview live (front),
// variables, liaison rôle, sauvegarde draft + publication + rollback. react-query. Aucun envoi.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingState, ErrorState, Button } from '@bs/ui';
import {
  ApiError,
  getMailTemplate,
  listMailTemplateVersions,
  createMailTemplateDraft,
  publishMailTemplateDraft,
  rollbackMailTemplate,
  previewMailTemplate,
  getTemplateRoleBinding,
  KNOWN_TEMPLATE_VARIABLES,
  type MailTemplatePreview,
} from '@bs/api-client';
import { TemplateSubjectEditor, TemplateHtmlEditor, TemplateTextEditor, TemplatePublishPanel, TemplateRollbackPanel } from './editors';
import { TemplateRoleBindingCard, TemplateVariablesPanel, TemplatePreviewPane, MobileTemplateToolbar } from './components';
import { MOCK_PREVIEW_VARS } from './mock';

function messageFromError(err: unknown): string {
  if (err instanceof ApiError) return err.status === 403 ? 'Accès réservé.' : err.message || 'Erreur.';
  return 'Une erreur est survenue.';
}

interface Draft { subject: string; html: string; text: string }

export function MailTemplateEditor({ functionName }: { functionName: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ subject: '', html: '', text: '' });
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MailTemplatePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const tplQuery = useQuery({ queryKey: ['mail-template', functionName], queryFn: () => getMailTemplate(functionName), retry: false });
  const versionsQuery = useQuery({ queryKey: ['mail-template-versions', functionName], queryFn: () => listMailTemplateVersions(functionName), retry: false });

  useEffect(() => {
    if (tplQuery.status === 'success' && loadedKey !== functionName) {
      const t = tplQuery.data;
      setDraft({ subject: t?.subject ?? '', html: t?.fullHtml || t?.bodyHtml || '', text: t?.bodyHtml ?? '' });
      setDraftId(null);
      setLoadedKey(functionName);
    }
  }, [tplQuery.status, tplQuery.data, functionName, loadedKey]);

  // Preview live (front, sans envoi) : re-render à chaque modif.
  useEffect(() => {
    let cancelled = false;
    void previewMailTemplate(functionName, { subject: draft.subject, html: draft.html, text: draft.text, variables: MOCK_PREVIEW_VARS })
      .then((p) => { if (!cancelled) setPreview(p); });
    return () => { cancelled = true; };
  }, [functionName, draft]);

  const binding = useMemo(() => getTemplateRoleBinding(functionName), [functionName]);
  const lastPublishedVersion = useMemo(() => {
    const pub = (versionsQuery.data ?? []).find((v) => v.status === 'published');
    return pub?.version ?? null;
  }, [versionsQuery.data]);

  const canSave = draft.subject.trim().length > 0 && draft.html.trim().length > 0;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['mail-template', functionName] });
    void qc.invalidateQueries({ queryKey: ['mail-template-versions', functionName] });
  };

  const saveMut = useMutation({
    mutationFn: () => createMailTemplateDraft(functionName, {
      subject: draft.subject, fullHtml: draft.html, bodyHtml: draft.text, mode: draft.html.trim() ? 'html' : 'text',
    }),
    onSuccess: (d) => { setActionError(null); setDraftId(d._id); setSavedAt(Date.now()); invalidate(); },
    onError: (e) => setActionError(messageFromError(e)),
  });

  const publishMut = useMutation({
    mutationFn: () => {
      if (!draftId) throw new ApiError({ status: 400, code: null, message: 'Enregistrez un brouillon d’abord.', body: null });
      return publishMailTemplateDraft(draftId);
    },
    onSuccess: () => { setActionError(null); setDraftId(null); invalidate(); },
    onError: (e) => setActionError(messageFromError(e)),
  });

  const rollbackMut = useMutation({
    mutationFn: (version: number) => rollbackMailTemplate(functionName, version),
    onSuccess: () => { setActionError(null); setLoadedKey(''); invalidate(); },
    onError: (e) => setActionError(messageFromError(e)),
  });

  if (tplQuery.status === 'pending') return <LoadingState label="Chargement du template…" />;
  if (tplQuery.status === 'error') {
    const denied = tplQuery.error instanceof ApiError && tplQuery.error.status === 403;
    return <ErrorState title={denied ? 'Accès réservé.' : 'Template introuvable.'} />;
  }

  const onSave = () => saveMut.mutate();

  return (
    <div className="mt-page">
      <div className="mt-editor">
        <div className="mt-page">
          <TemplateSubjectEditor value={draft.subject} onChange={(v) => setDraft((d) => ({ ...d, subject: v }))} />
          <TemplateHtmlEditor value={draft.html} onChange={(v) => setDraft((d) => ({ ...d, html: v }))} />
          <TemplateTextEditor value={draft.text} onChange={(v) => setDraft((d) => ({ ...d, text: v }))} />

          <div className="mt-actions">
            <Button type="button" disabled={!canSave || saveMut.isPending} onClick={onSave}>
              {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </Button>
          </div>
          {!canSave ? <p className="mt-warning">L'objet et le contenu HTML sont requis.</p> : null}
          {actionError ? <p className="mt-error">{actionError}</p> : null}
          {savedAt > 0 && !actionError ? <p className="mt-success">Brouillon enregistré.</p> : null}

          <TemplateRoleBindingCard binding={binding} />
          <TemplateVariablesPanel
            used={preview?.usedVariables ?? []}
            unknown={preview?.unknownVariables ?? []}
            catalog={KNOWN_TEMPLATE_VARIABLES}
          />
          <TemplatePublishPanel hasDraft={Boolean(draftId)} publishing={publishMut.isPending} onPublish={() => publishMut.mutate()} lastPublishedVersion={lastPublishedVersion} />
          <TemplateRollbackPanel versions={versionsQuery.data ?? []} busy={rollbackMut.isPending} onRollback={(v) => rollbackMut.mutate(v)} />
        </div>

        <div className={`mt-preview-col ${previewOpen ? '' : 'mt-preview-col--collapsed'}`.trim()}>
          <TemplatePreviewPane subject={preview?.subject ?? draft.subject} html={preview?.html ?? draft.html} text={preview?.text ?? draft.text} />
        </div>
      </div>

      <MobileTemplateToolbar canSave={canSave} saving={saveMut.isPending} onSave={onSave} onTogglePreview={() => setPreviewOpen((v) => !v)} previewOpen={previewOpen} />
    </div>
  );
}

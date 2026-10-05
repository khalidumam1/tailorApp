import type {
  BusinessConfiguration,
  BusinessFieldInput,
  BusinessStageInput,
  BusinessTransitionInput,
} from './api';

type FieldType = BusinessFieldInput['type'];

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'TEXT', label: 'Short text' },
  { value: 'LONG_TEXT', label: 'Long text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'CURRENCY', label: 'Currency' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date and time' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'MULTI_SELECT', label: 'Multiple choice' },
  { value: 'BOOLEAN', label: 'Yes / no' },
  { value: 'MEASUREMENT', label: 'Measurement' },
  { value: 'REFERENCE', label: 'Reference' },
  { value: 'NOTES', label: 'Notes' },
];

function optionKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === 'string') return [option];
    if (option && typeof option === 'object' && 'key' in option && typeof option.key === 'string') {
      return [option.key];
    }
    return [];
  });
}

function updateOptions(current: unknown, input: string): unknown[] {
  const existing = Array.isArray(current) ? current : [];
  return input.split(',').map((value) => value.trim()).filter(Boolean).map((key) =>
    existing.find((option) =>
      (typeof option === 'string' && option === key)
      || (option && typeof option === 'object' && !Array.isArray(option)
        && 'key' in option && option.key === key)) ?? key);
}

function validationRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function jsonValue(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) return '';
  const current = (value as Record<string, unknown>)[key];
  return typeof current === 'number' || typeof current === 'string' ? String(current) : '';
}

type Props = {
  fields: BusinessFieldInput[];
  inheritedFields: BusinessConfiguration['fields'];
  availableModules: string[];
  workflowEnabled: boolean;
  stages: BusinessStageInput[];
  transitions: BusinessTransitionInput[];
  onFieldsChange: (fields: BusinessFieldInput[]) => void;
  onWorkflowChange: (stages: BusinessStageInput[], transitions: BusinessTransitionInput[]) => void;
};

export function BusinessStructureEditors({
  fields,
  inheritedFields,
  availableModules,
  workflowEnabled,
  stages,
  transitions,
  onFieldsChange,
  onWorkflowChange,
}: Props) {
  function updateField(index: number, patch: Partial<BusinessFieldInput>) {
    onFieldsChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  }

  function updateStage(index: number, patch: Partial<BusinessStageInput>) {
    onWorkflowChange(stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage), transitions);
  }

  function updateTransition(index: number, patch: Partial<BusinessTransitionInput>) {
    onWorkflowChange(stages, transitions.map((transition, transitionIndex) =>
      transitionIndex === index ? { ...transition, ...patch } : transition));
  }

  function addField() {
    const module = availableModules[0] ?? '';
    const screen = module === 'customers' ? 'customer' : module === 'orders' ? 'order' : module === 'catalog' ? 'catalog-item' : 'record';
    onFieldsChange([...fields, {
      module,
      screen,
      key: '',
      label: '',
      type: 'TEXT',
      required: false,
      sortOrder: fields.length,
    }]);
  }

  function addStage() {
    const key = `STAGE_${stages.length + 1}`;
    const nextStages = [...stages, {
      key,
      label: `Stage ${stages.length + 1}`,
      sortOrder: stages.length,
      isInitial: false,
      isTerminal: false,
      actions: [],
    }];
    const nextTransitions = stages.length
      ? [...transitions, { from: stages.at(-1)!.key, to: key, allowedRoleKeys: [], actions: [] }]
      : transitions;
    onWorkflowChange(nextStages, nextTransitions);
  }

  function addTransition() {
    if (stages.length < 2) return;
    onWorkflowChange(stages, [...transitions, {
      from: stages[0].key,
      to: stages[1].key,
      allowedRoleKeys: [],
      actions: [],
    }]);
  }

  return (
    <div className="content-stack">
      <section className="panel form-panel">
        <div className="section-heading">
          <div><h3>Business custom fields</h3><p className="muted">These definitions belong to this business. Template fields below remain read-only and continue to be inherited.</p></div>
          <button className="button button-secondary" type="button" onClick={addField}>Add field</button>
        </div>
        {fields.map((field, index) => {
          const validation = validationRecord(field.validation);
          const choices = ['DROPDOWN', 'MULTI_SELECT'].includes(field.type);
          return (
            <article className="structure-editor-card" key={`${field.key || 'new'}-${index}`}>
              <div className="form-grid">
                <label>Field key<input value={field.key} onChange={(event) => updateField(index, { key: event.target.value })} pattern="[a-z][a-z0-9_-]{0,79}" maxLength={80} required /></label>
                <label>Label<input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} maxLength={120} required /></label>
                <label>Module<select value={field.module} onChange={(event) => updateField(index, { module: event.target.value })} required>
                  {[...new Set([...availableModules, field.module])].map((module) => <option key={module} value={module}>{module}{availableModules.includes(module) ? '' : ' (currently disabled)'}</option>)}
                </select></label>
                <label>Screen<input value={field.screen} onChange={(event) => updateField(index, { screen: event.target.value })} pattern="[a-z][a-z0-9_-]{0,79}" maxLength={80} required /></label>
                <label>Field type<select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as FieldType })}>
                  {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select></label>
                <label>Display order<input type="number" min={0} max={10000} value={field.sortOrder} onChange={(event) => updateField(index, { sortOrder: Number(event.target.value) })} required /></label>
                <label className="checkbox-row"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />Required field</label>
                {choices && <label className="span-all">Options (comma-separated keys)<input
                  value={optionKeys(field.options).join(', ')}
                  onChange={(event) => updateField(index, { options: updateOptions(field.options, event.target.value) })}
                  placeholder="for example: small, medium, large"
                  required
                /></label>}
                <label>Minimum<input type="number" value={jsonValue(field.validation, field.type === 'TEXT' || field.type === 'LONG_TEXT' || field.type === 'NOTES' ? 'minLength' : 'min')} onChange={(event) => {
                  const key = field.type === 'TEXT' || field.type === 'LONG_TEXT' || field.type === 'NOTES' ? 'minLength' : 'min';
                  const next = { ...validation };
                  if (event.target.value) next[key] = Number(event.target.value);
                  else delete next[key];
                  updateField(index, { validation: next });
                }} /></label>
                <label>Maximum<input type="number" value={jsonValue(field.validation, field.type === 'TEXT' || field.type === 'LONG_TEXT' || field.type === 'NOTES' ? 'maxLength' : 'max')} onChange={(event) => {
                  const key = field.type === 'TEXT' || field.type === 'LONG_TEXT' || field.type === 'NOTES' ? 'maxLength' : 'max';
                  const next = { ...validation };
                  if (event.target.value) next[key] = Number(event.target.value);
                  else delete next[key];
                  updateField(index, { validation: next });
                }} /></label>
                {(field.type === 'TEXT' || field.type === 'LONG_TEXT' || field.type === 'NOTES' || field.type === 'REFERENCE') && (
                  <label className="span-all">Format pattern<input value={typeof validation.pattern === 'string' ? validation.pattern : ''} onChange={(event) => updateField(index, {
                    validation: (() => {
                      const next = { ...validation };
                      if (event.target.value) next.pattern = event.target.value;
                      else delete next.pattern;
                      return next;
                    })(),
                  })} maxLength={300} /></label>
                )}
              </div>
              <button className="button button-quiet" type="button" onClick={() => onFieldsChange(fields.filter((_, fieldIndex) => fieldIndex !== index))}>Remove field</button>
            </article>
          );
        })}
        {fields.length === 0 && <p className="muted">No business-specific fields. Add one to extend the template.</p>}
        {inheritedFields.length > 0 && (
          <div className="inherited-field-list">
            <h4>Inherited template fields</h4>
            {inheritedFields.map((field) => <p key={field.id}>{field.label} <span>{field.module} · {field.screen} · {field.type}</span></p>)}
          </div>
        )}
      </section>

      <section className="panel form-panel">
        {!workflowEnabled && <p className="muted">Enable the orders module to edit this business’s workflow. The inherited or existing stages remain available for review.</p>}
        <fieldset className="structure-workflow-fieldset" disabled={!workflowEnabled}>
          <div className="section-heading">
            <div><h3>Business workflow</h3><p className="muted">Publishing creates a workflow scoped only to this business. Active orders cannot be left behind in a removed stage.</p></div>
            <button className="button button-secondary" type="button" onClick={addStage}>Add stage</button>
          </div>
        {stages.map((stage, index) => (
          <article className="structure-editor-card" key={`${stage.key}-${index}`}>
            <div className="form-grid">
              <label>Stage key<input value={stage.key} onChange={(event) => {
                const oldKey = stage.key;
                const nextKey = event.target.value;
                const nextStages = stages.map((item, stageIndex) => stageIndex === index ? { ...item, key: nextKey } : item);
                const nextTransitions = transitions.map((transition) => ({
                  ...transition,
                  from: transition.from === oldKey ? nextKey : transition.from,
                  to: transition.to === oldKey ? nextKey : transition.to,
                }));
                onWorkflowChange(nextStages, nextTransitions);
              }} pattern="[A-Za-z][A-Za-z0-9_-]{0,79}" maxLength={80} required /></label>
              <label>Stage label<input value={stage.label} onChange={(event) => updateStage(index, { label: event.target.value })} maxLength={120} required /></label>
              <label>Order<input type="number" min={0} max={10000} value={stage.sortOrder} onChange={(event) => updateStage(index, { sortOrder: Number(event.target.value) })} required /></label>
              <label className="checkbox-row"><input type="checkbox" checked={stage.isInitial} onChange={(event) => onWorkflowChange(stages.map((item, stageIndex) => ({
                ...item,
                isInitial: stageIndex === index ? event.target.checked : event.target.checked ? false : item.isInitial,
              })), transitions)} />Initial stage</label>
              <label className="checkbox-row"><input type="checkbox" checked={stage.isTerminal} onChange={(event) => updateStage(index, { isTerminal: event.target.checked })} />Terminal stage</label>
              <label>Actions (comma-separated keys)<input value={stage.actions.join(', ')} onChange={(event) => updateStage(index, { actions: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
            </div>
            <button className="button button-quiet" type="button" disabled={stages.length <= 2} onClick={() => {
              const removedKey = stage.key;
              const nextStages = stages.filter((_, stageIndex) => stageIndex !== index).map((item, stageIndex) => ({ ...item, sortOrder: stageIndex }));
              if (!nextStages.some((item) => item.isInitial)) nextStages[0] = { ...nextStages[0], isInitial: true };
              onWorkflowChange(nextStages, transitions.filter((transition) => transition.from !== removedKey && transition.to !== removedKey));
            }}>Remove stage</button>
          </article>
        ))}
        <div className="section-heading transition-editor-heading">
          <div><h4>Allowed transitions</h4><p className="muted">Role keys are compared to the member’s business role name.</p></div>
          <button className="button button-secondary" type="button" onClick={addTransition}>Add transition</button>
        </div>
        {transitions.map((transition, index) => (
          <div className="form-grid structure-transition" key={`${transition.from}-${transition.to}-${index}`}>
            <label>From<select value={transition.from} onChange={(event) => updateTransition(index, { from: event.target.value })}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
            <label>To<select value={transition.to} onChange={(event) => updateTransition(index, { to: event.target.value })}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
            <label>Allowed role keys<input value={transition.allowedRoleKeys.join(', ')} onChange={(event) => updateTransition(index, { allowedRoleKeys: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
            <label>Actions<input value={transition.actions.join(', ')} onChange={(event) => updateTransition(index, { actions: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label>
            <button className="button button-quiet" type="button" onClick={() => onWorkflowChange(stages, transitions.filter((_, transitionIndex) => transitionIndex !== index))}>Remove transition</button>
          </div>
        ))}
        {transitions.length === 0 && <p className="muted">No transitions configured.</p>}
        </fieldset>
      </section>
    </div>
  );
}

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fumadocs/api-docs/components/select';
import { useOperationContext, useRenderContext } from 'fumadocs-openapi/ui';
import { Parameter, requestExamples, type RequestExample } from '@/lib/request-examples';

interface ExampleSelection {
  operation: unknown;
  parameters: Parameter[];
  examples: RequestExample[];
  selected: RequestExample;
  select: (id: string) => void;
}

const SelectionContext = createContext<ExampleSelection | undefined>(undefined);

export function useExampleSelection(): ExampleSelection {
  const selection = useContext(SelectionContext);
  if (selection === undefined) throw new Error('useExampleSelection needs an ExampleLayout above it');
  return selection;
}

// Fumadocs' own selector lists request body examples only, and ignores an id outside that list.
export function renderExampleLayout(slots: Readonly<{ usageTabs: ReactNode; responseTabs: ReactNode }>): ReactNode {
  return <ExampleLayout usageTabs={slots.usageTabs} responseTabs={slots.responseTabs} />;
}

function ExampleLayout({ usageTabs, responseTabs }: Readonly<{ usageTabs: ReactNode; responseTabs: ReactNode }>) {
  const { schema } = useRenderContext();
  const { route, examples: bodyExamples, setExample } = useOperationContext();
  const pathItem = schema.resolve(schema.dereferenced.paths?.[route]);
  const operation = pathItem?.[bodyExamples[0].data.method];
  const parameters = useMemo(() => Parameter.listIn(operation, pathItem), [operation, pathItem]);
  const examples = useMemo(() => requestExamples(bodyExamples, parameters), [bodyExamples, parameters]);
  const [selectedId, setSelectedId] = useState(examples[0].id);

  const selection: ExampleSelection = {
    operation,
    parameters,
    examples,
    selected: examples.find((example) => example.id === selectedId) ?? examples[0],
    select: (id) => {
      setSelectedId(id);
      setExample(id);
    }
  };
  return (
    <SelectionContext.Provider value={selection}>
      <div className="prose-no-margin">
        <ExampleSelector />
        {usageTabs}
        {responseTabs}
      </div>
    </SelectionContext.Provider>
  );
}

function ExampleSelector() {
  const { examples, selected, select } = useExampleSelection();
  if (examples.length === 1) return null;

  const items = examples.map((example) => ({
    value: example.id,
    label: (
      <div>
        <p className="font-medium text-sm">{example.name}</p>
        <p className="text-fd-muted-foreground">{example.description}</p>
      </div>
    )
  }));
  return (
    <Select items={items} value={selected.id} onValueChange={(id) => id !== null && select(id)}>
      <SelectTrigger className="not-prose mb-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

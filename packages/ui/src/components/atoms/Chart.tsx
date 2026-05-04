'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import {cn} from '../../lib';

// ============================================
// TYPES
// ============================================

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
    theme?: {
      light?: string;
      dark?: string;
    };
  }
>;

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.use(ChartContext);

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }

  return context;
}

// ============================================
// CHART CONTAINER
// ============================================

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}

function ChartContainer({id, className, children, config, ref, ...props}: ChartContainerProps) {
    const uniqueId = React.useId();
    const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

    return (
      <ChartContext.Provider value={{config}}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn('flex aspect-video justify-center text-xs', className)}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
}
ChartContainer.displayName = 'ChartContainer';

// ============================================
// CHART STYLE
// ============================================

const ChartStyle = ({id, config}: {id: string; config: ChartConfig}) => {
  const colorConfig = Object.entries(config).filter(([_, config]) => config.theme || config.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {
${Object.entries(config)
  .filter(([_, config]) => config.theme || config.color)
  .map(([key, itemConfig]) => {
    const color = typeof itemConfig.color === 'string' ? itemConfig.color : itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join('\n')}
}`,
      }}
    />
  );
};

// ============================================
// CHART TOOLTIP
// ============================================

interface ChartTooltipContentProps
  extends Omit<React.ComponentProps<typeof RechartsPrimitive.Tooltip>, never>,
    Omit<React.ComponentProps<'div'>, 'content'> {
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: 'line' | 'dot' | 'dashed';
  nameKey?: string;
  labelKey?: string;
  payload?: any;
  label?: any;
  labelFormatter?: any;
  formatter?: any;
  active?: any;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
  ref,
}: ChartTooltipContentProps & {ref?: React.Ref<HTMLDivElement>}) {
    const {config} = useChart();

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null;
      }

      const [item] = payload;
      const key = `${labelKey || item.dataKey || item.name || 'value'}`;
      const itemConfig = config[key];
      const value = !labelKey && typeof label === 'string' ? config[label]?.label || label : itemConfig?.label;

      if (labelFormatter) {
        return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>;
      }

      if (!value) {
        return null;
      }

      return <div className={cn('font-medium', labelClassName)}>{value}</div>;
    }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

    if (!active || !payload?.length) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-md',
          className,
        )}
      >
        {!hideLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item: any, index: number) => {
            const key = `${nameKey || item.name || item.dataKey || 'value'}`;
            const itemConfig = config[key];
            const indicatorColor = color || item.payload.fill || item.color;

            return (
              <div
                key={item.dataKey}
                className={cn(
                  'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
                  indicator === 'dot' && 'items-center',
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn('shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]', {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                            'my-0.5': item.value === undefined,
                          })}
                          style={
                            {
                              '--color-bg': indicatorColor,
                              '--color-border': indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        'flex flex-1 justify-between leading-none',
                        item.value === undefined && 'items-end',
                      )}
                    >
                      <div className="grid gap-1.5">
                        <span className="text-muted-foreground">{itemConfig?.label || item.name}</span>
                      </div>
                      {item.value !== undefined && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
}
ChartTooltipContent.displayName = 'ChartTooltipContent';

// ============================================
// CHART LEGEND
// ============================================

interface ChartLegendContentProps extends Omit<React.ComponentProps<'div'>, 'payload'> {
  hideIcon?: boolean;
  nameKey?: string;
  payload?: any;
  verticalAlign?: any;
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = 'bottom',
  nameKey,
  ref,
}: ChartLegendContentProps & {ref?: React.Ref<HTMLDivElement>}) {
    const {config} = useChart();

    if (!payload?.length) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-center gap-6', verticalAlign === 'top' ? 'pb-4' : 'pt-4', className)}
      >
        {payload.map((item: any) => {
          const key = `${nameKey || item.dataKey || 'value'}`;
          const itemConfig = config[key];

          return (
            <div
              key={item.value}
              className={cn('flex items-center gap-2 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-muted-foreground')}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              <span className="text-xs font-medium text-muted-foreground">{itemConfig?.label || item.value}</span>
            </div>
          );
        })}
      </div>
    );
}
ChartLegendContent.displayName = 'ChartLegendContent';

export {ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle};

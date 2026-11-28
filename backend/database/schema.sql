--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'Open',
    'Served',
    'Paid',
    'Cancelled',
    'Preparing',
    'Ready'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'mtn_momo',
    'airtel_money',
    'pos'
);


--
-- Name: stock_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_movement_type AS ENUM (
    'purchase',
    'sale',
    'adjustment',
    'waste',
    'transfer'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'manager',
    'accountant',
    'waiter',
    'kitchen',
    'bar',
    'operator'
);


--
-- Name: handle_subscription_payment_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_subscription_payment_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    calculated_expiry DATE;
BEGIN
    -- Only run this logic if payment is PAID
    IF (TG_OP = 'INSERT' AND NEW.payment_status = 'PAID') OR 
       (TG_OP = 'UPDATE' AND NEW.payment_status = 'PAID' AND (OLD.payment_status IS DISTINCT FROM 'PAID' OR OLD.status IS DISTINCT FROM 'ACTIVE')) THEN
        
        -- 1. Automatically calculate the expiry date based on billing_cycle
        IF NEW.billing_cycle = 'MONTHLY' THEN
            calculated_expiry := NEW.start_date + INTERVAL '1 month';
        ELSIF NEW.billing_cycle = 'QUARTERLY' THEN
            calculated_expiry := NEW.start_date + INTERVAL '3 months';
        ELSIF NEW.billing_cycle = 'ANNUALLY' THEN
            calculated_expiry := NEW.start_date + INTERVAL '1 year';
        ELSE
            calculated_expiry := NEW.start_date + INTERVAL '1 month'; -- Fallback default
        END IF;

        -- Apply the calculated date to our column
        NEW.expiry_date := calculated_expiry;

        -- 2. Force status to 'ACTIVE'
        NEW.status := 'ACTIVE';

        -- 3. Update the parent business's main subscription status
        UPDATE businesses
        SET subscription_status = NEW.subscription_plan,
            updated_at = CURRENT_TIMESTAMP
        WHERE business_id = NEW.business_id;

        -- 4. Create an audit log entry
        INSERT INTO audit_logs (user_id, activity, module, details)
        VALUES (
            NULL, -- System generated
            'SUBSCRIPTION_ACTIVATED',
            'SUBSCRIPTION',
            'Subscription plan (' || NEW.subscription_plan || ' - ' || NEW.billing_cycle || ') activated for Business ID ' || NEW.business_id || '. Expires on ' || calculated_expiry
        );
        
    END IF;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    type text NOT NULL,
    balance numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    description text NOT NULL,
    amount numeric(14,2) NOT NULL,
    type text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    actor_id uuid,
    actor_name text DEFAULT 'system'::text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    target_module text,
    ip_address text
);


--
-- Name: backup_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    backup_name text NOT NULL,
    backup_path text,
    backup_type text DEFAULT 'full'::text NOT NULL,
    file_size bigint DEFAULT 0,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT backup_records_backup_type_check CHECK ((backup_type = ANY (ARRAY['full'::text, 'partial'::text]))),
    CONSTRAINT backup_records_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: bank_statement_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statement_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_id uuid NOT NULL,
    date date NOT NULL,
    description text NOT NULL,
    reference text,
    type text NOT NULL,
    statement_amount numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by text DEFAULT 'Accountant'::text NOT NULL
);


--
-- Name: branch_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_stock (
    branch_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(14,3) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_main boolean DEFAULT false NOT NULL
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    currency_code character(3) DEFAULT 'RWF'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    address text,
    phone text,
    email text,
    tax_rate numeric(5,2) DEFAULT 18 NOT NULL,
    registration_code character varying(100),
    contact_email character varying(255),
    contact_phone character varying(50),
    city character varying(100),
    country character varying(100) DEFAULT 'Rwanda'::character varying,
    business_type character varying(100) DEFAULT 'bar'::character varying,
    is_verified boolean DEFAULT false,
    is_suspended boolean DEFAULT false,
    description text,
    province text,
    district text,
    sector text,
    slug character varying(120) NOT NULL,
    unpaid_access_granted boolean DEFAULT false NOT NULL,
    CONSTRAINT businesses_business_type_check CHECK (((business_type)::text = ANY (ARRAY[('bar'::character varying)::text, ('restaurant'::character varying)::text, ('hotel'::character varying)::text, ('lounge'::character varying)::text, ('other'::character varying)::text])))
);


--
-- Name: customer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    table_number text NOT NULL,
    session_token text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
);


--
-- Name: dining_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dining_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    table_number integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dining_tables_table_number_check CHECK ((table_number > 0))
);


--
-- Name: email_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    body text,
    notification_type text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    branch_id uuid,
    name text NOT NULL,
    sku text,
    quantity numeric(14,3) DEFAULT 0 NOT NULL,
    cost_price numeric(14,2) DEFAULT 0 NOT NULL,
    selling_price numeric(14,2) DEFAULT 0 NOT NULL,
    min_stock_level numeric(14,3) DEFAULT 0 NOT NULL,
    unit text DEFAULT 'units'::text NOT NULL,
    expiry_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text
);


--
-- Name: order_item_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    product_id uuid NOT NULL,
    original_quantity numeric(14,3) NOT NULL,
    updated_quantity numeric(14,3) NOT NULL,
    change_type text DEFAULT 'restock'::text NOT NULL,
    reason text NOT NULL,
    changed_by uuid,
    changed_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    line_total numeric(14,2) NOT NULL,
    CONSTRAINT order_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    status text NOT NULL,
    changed_by text DEFAULT 'system'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    waiter_id uuid,
    status public.order_status DEFAULT 'Open'::public.order_status NOT NULL,
    table_name text,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    order_type text DEFAULT 'food'::text NOT NULL,
    customer_phone text,
    source text DEFAULT 'waiter'::text NOT NULL,
    table_number text,
    order_number text,
    payment_method text,
    station text DEFAULT 'kitchen'::text NOT NULL,
    user_id uuid,
    customer_name character varying(255)
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    platform_admin_id uuid,
    CONSTRAINT password_reset_tokens_account_check CHECK (((user_id IS NOT NULL) OR (platform_admin_id IS NOT NULL)))
);


--
-- Name: payment_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    qr_payment_enabled boolean DEFAULT false NOT NULL,
    mtn_momo_number text,
    airtel_money_number text,
    merchant_code text,
    bank_account text,
    merchant_name text DEFAULT 'BarFlow Business'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    received_by uuid,
    method public.payment_method NOT NULL,
    amount numeric(14,2) NOT NULL,
    reference text,
    paid_at timestamp with time zone DEFAULT now(),
    provider character varying(64),
    provider_txn_id character varying(128),
    provider_status character varying(64),
    provider_payload jsonb,
    branch_id uuid,
    business_id uuid,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: platform_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_name character varying(255),
    actor_id uuid,
    action text NOT NULL,
    module character varying(80) DEFAULT 'Platform'::character varying,
    category character varying(40) DEFAULT 'activity'::character varying,
    ip_address character varying(80),
    device text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    full_name character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'super_admin'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone character varying(50),
    permissions jsonb DEFAULT '["businesses", "subscriptions", "payments", "reports", "settings"]'::jsonb,
    two_factor_code text,
    two_factor_expires_at timestamp with time zone,
    two_factor_verified boolean DEFAULT false NOT NULL
);


--
-- Name: platform_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    backup_name character varying(255) NOT NULL,
    backup_type character varying(30) DEFAULT 'full'::character varying NOT NULL,
    file_size character varying(40),
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_backups_backup_type_check CHECK (((backup_type)::text = ANY (ARRAY[('full'::character varying)::text, ('incremental'::character varying)::text, ('database'::character varying)::text, ('file'::character varying)::text, ('config'::character varying)::text]))),
    CONSTRAINT platform_backups_status_check CHECK (((status)::text = ANY (ARRAY[('completed'::character varying)::text, ('in_progress'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: platform_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    subscription_id uuid,
    plan character varying(120),
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    payment_method character varying(50) DEFAULT 'mtn_momo'::character varying,
    transaction_id character varying(120),
    status character varying(20) DEFAULT 'paid'::character varying NOT NULL,
    paid_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_txn_id character varying(128),
    provider_status character varying(64),
    provider_payload jsonb,
    CONSTRAINT platform_payments_status_check CHECK (((status)::text = ANY (ARRAY[('paid'::character varying)::text, ('pending'::character varying)::text, ('failed'::character varying)::text, ('refunded'::character varying)::text])))
);


--
-- Name: platform_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    business_id uuid,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    reason text,
    processed_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key character varying(120) NOT NULL,
    setting_value text,
    setting_group character varying(60) DEFAULT 'general'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    type text DEFAULT 'general'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    selling_price numeric(14,2) NOT NULL,
    cost_price numeric(14,2) DEFAULT 0 NOT NULL,
    stock_unit text DEFAULT 'unit'::text NOT NULL,
    low_stock_threshold numeric(14,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    quantity numeric(14,3) DEFAULT 0 NOT NULL,
    category_id uuid,
    bottle_size text,
    bottles_per_crate integer,
    expiry_date date,
    ingredient_unit text,
    branch_id uuid,
    CONSTRAINT products_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT products_selling_price_check CHECK ((selling_price >= (0)::numeric))
);


--
-- Name: receipt_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_settings (
    id integer NOT NULL,
    business_id integer NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: receipt_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receipt_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receipt_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receipt_settings_id_seq OWNED BY public.receipt_settings.id;


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    receipt_number text NOT NULL,
    payment_method text NOT NULL,
    amount_paid numeric(14,2) NOT NULL,
    customer_phone text,
    receipt_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    CONSTRAINT refunds_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    amount numeric(14,2) NOT NULL,
    method text NOT NULL,
    actor text NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    status text DEFAULT 'Pending'::text NOT NULL,
    pay_period_start date,
    pay_period_end date,
    payment_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pay_period text,
    approved_by uuid,
    approved_at timestamp with time zone,
    gross_amount numeric(14,2) DEFAULT 0,
    tax_amount numeric(14,2) DEFAULT 0,
    insurance_amount numeric(14,2) DEFAULT 0,
    net_amount numeric(14,2) DEFAULT 0,
    bonus numeric(14,2) DEFAULT 0,
    promotion text DEFAULT ''::text,
    branch_id uuid,
    payout_reference character varying(128),
    provider_txn_id character varying(128),
    provider_status character varying(64),
    provider_payload jsonb,
    payout_requested_at timestamp with time zone,
    CONSTRAINT salary_payments_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    from_user uuid NOT NULL,
    to_user uuid,
    to_phone text,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    description text,
    manager_approval integer DEFAULT 0 NOT NULL,
    manager_approved_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    branch_id uuid,
    CONSTRAINT transfers_manager_approval_check CHECK ((manager_approval = ANY (ARRAY[0, 1]))),
    CONSTRAINT transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
);


--
-- Name: reconciliation_transactions_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.reconciliation_transactions_view AS
 SELECT p.id,
    p.paid_at AS date,
        CASE p.method
            WHEN 'mtn_momo'::public.payment_method THEN 'MTN MoMo Deposit'::text
            WHEN 'airtel_money'::public.payment_method THEN 'Airtel Money Deposit'::text
            WHEN 'cash'::public.payment_method THEN 'Cash Sale'::text
            WHEN 'pos'::public.payment_method THEN 'Card Payment'::text
            ELSE 'Payment'::text
        END AS description,
    p.reference,
    'Deposit'::text AS type,
    p.amount AS statement_amount,
    o.total_amount AS system_amount,
        CASE
            WHEN (o.status = ANY (ARRAY['Paid'::public.order_status, 'Served'::public.order_status])) THEN (0)::numeric
            ELSE (p.amount - COALESCE(o.total_amount, (0)::numeric))
        END AS difference,
        CASE
            WHEN (o.id IS NULL) THEN 'In Statement Only'::text
            WHEN (o.status = ANY (ARRAY['Paid'::public.order_status, 'Served'::public.order_status])) THEN 'Matched'::text
            ELSE 'Unmatched'::text
        END AS status,
        CASE p.method
            WHEN 'mtn_momo'::public.payment_method THEN 'MoMo Merchant Account'::text
            WHEN 'airtel_money'::public.payment_method THEN 'MoMo Merchant Account'::text
            WHEN 'cash'::public.payment_method THEN 'Cash Till'::text
            WHEN 'pos'::public.payment_method THEN 'BK Main Account'::text
            ELSE 'Other'::text
        END AS bank_account
   FROM (public.payments p
     LEFT JOIN public.orders o ON ((o.id = p.order_id)))
UNION ALL
 SELECT r.id,
    r.created_at AS date,
    'Customer Refund'::text AS description,
    (r.id)::text AS reference,
    'Refund'::text AS type,
    (- r.amount) AS statement_amount,
    (- COALESCE(o.total_amount, (0)::numeric)) AS system_amount,
        CASE
            WHEN (o.status = 'Paid'::public.order_status) THEN (0)::numeric
            ELSE (- r.amount)
        END AS difference,
        CASE
            WHEN (o.id IS NULL) THEN 'In Statement Only'::text
            WHEN (o.status = 'Paid'::public.order_status) THEN 'Matched'::text
            ELSE 'Unmatched'::text
        END AS status,
    'Cash Till'::text AS bank_account
   FROM (public.refunds r
     LEFT JOIN public.orders o ON ((o.id = r.order_id)))
  WHERE (r.status = 'approved'::text)
UNION ALL
 SELECT t.id,
    t.created_at AS date,
    'Supplier Payment'::text AS description,
    (t.id)::text AS reference,
    'Payment'::text AS type,
    (- t.amount) AS statement_amount,
    (- t.amount) AS system_amount,
    0 AS difference,
    'Matched'::text AS status,
    'BK Main Account'::text AS bank_account
   FROM public.transfers t
  WHERE (t.status = 'completed'::text)
UNION ALL
 SELECT s.id,
    s.paid_at AS date,
    'Bank Charges'::text AS description,
    (s.id)::text AS reference,
    'Expense'::text AS type,
    (- s.amount) AS statement_amount,
    (- s.amount) AS system_amount,
    0 AS difference,
    'Matched'::text AS status,
    'BK Main Account'::text AS bank_account
   FROM public.salary_payments s
  WHERE (s.status = 'paid'::text);


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recorded numeric(14,2) DEFAULT 0 NOT NULL,
    banked numeric(14,2) DEFAULT 0 NOT NULL,
    difference numeric(14,2) DEFAULT 0 NOT NULL,
    actor text DEFAULT 'Accountant'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    format text DEFAULT 'pdf'::text NOT NULL,
    generated_by text DEFAULT 'Accountant'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: revenue_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenue_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    type text NOT NULL,
    description text,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    reference_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT revenue_logs_type_check CHECK ((type = ANY (ARRAY['received'::text, 'stock_ordered'::text, 'stock_sold'::text])))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    role text NOT NULL,
    can_withdraw integer DEFAULT 0 NOT NULL,
    can_transfer integer DEFAULT 0 NOT NULL,
    can_manage_users integer DEFAULT 0 NOT NULL,
    can_view_revenue integer DEFAULT 0 NOT NULL,
    can_manage_settings integer DEFAULT 0 NOT NULL,
    can_view_withdraw_logs integer DEFAULT 0 NOT NULL,
    can_view_transfer_logs integer DEFAULT 0 NOT NULL,
    can_approve_transfers integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    opening_cash numeric(14,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(14,2)
);


--
-- Name: staff_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid,
    user_id uuid NOT NULL,
    role text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    start_note text,
    end_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_shifts_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_id uuid NOT NULL,
    adjusted_by uuid NOT NULL,
    adjustment_type text DEFAULT 'adjustment'::text NOT NULL,
    quantity numeric(14,3) DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_by uuid,
    movement_type public.stock_movement_type NOT NULL,
    quantity_change numeric(14,3) NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price_monthly numeric(14,2) DEFAULT 0 NOT NULL,
    price_yearly numeric(14,2) DEFAULT 0 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    discount_quarterly numeric(5,2) DEFAULT 8,
    discount_annually numeric(5,2) DEFAULT 14
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    plan text DEFAULT 'Pro'::text NOT NULL,
    current_period_end timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_date timestamp with time zone,
    expiration_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    payment_method text,
    phone_number text,
    ussd_code text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    receipt_number text,
    receipt_generated integer DEFAULT 0 NOT NULL,
    remaining_days integer DEFAULT 0,
    next_renewal_date timestamp with time zone,
    amount_paid numeric(14,2) DEFAULT 0,
    plan_id uuid,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    auto_renew boolean DEFAULT true,
    discount_percent numeric(5,2) DEFAULT 0,
    CONSTRAINT subscriptions_billing_cycle_check CHECK (((billing_cycle)::text = ANY (ARRAY[('monthly'::character varying)::text, ('quarterly'::character varying)::text, ('annually'::character varying)::text]))),
    CONSTRAINT subscriptions_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])))
);


--
-- Name: support_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid,
    sender_type character varying(20) NOT NULL,
    sender_name character varying(255),
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_replies_sender_type_check CHECK (((sender_type)::text = ANY (ARRAY[('business'::character varying)::text, ('admin'::character varying)::text])))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    user_id uuid,
    subject character varying(500) NOT NULL,
    message text NOT NULL,
    category character varying(50) DEFAULT 'general'::character varying,
    priority character varying(20) DEFAULT 'normal'::character varying,
    status character varying(20) DEFAULT 'open'::character varying,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_tickets_category_check CHECK (((category)::text = ANY (ARRAY[('general'::character varying)::text, ('billing'::character varying)::text, ('technical'::character varying)::text, ('feature'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT support_tickets_priority_check CHECK (((priority)::text = ANY (ARRAY[('low'::character varying)::text, ('normal'::character varying)::text, ('high'::character varying)::text, ('urgent'::character varying)::text]))),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text, ('resolved'::character varying)::text, ('closed'::character varying)::text])))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    setting_key text NOT NULL,
    setting_value text,
    setting_group text DEFAULT 'general'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: two_factor_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code text NOT NULL,
    method text DEFAULT 'email'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: two_factor_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT 'platform'::text NOT NULL,
    business_id uuid,
    is_enabled boolean DEFAULT false NOT NULL,
    method text DEFAULT 'email'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    business_id uuid NOT NULL,
    user_id uuid NOT NULL,
    permission text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    salary numeric(14,2) DEFAULT 0 NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    updated_at timestamp with time zone,
    username text,
    avatar_url text,
    bonus numeric(14,2) DEFAULT 0,
    promotion text DEFAULT ''::text
);


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    phone_number text NOT NULL,
    purpose text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    initiated_by uuid NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    branch_id uuid,
    CONSTRAINT withdrawals_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'pending'::text, 'cancelled'::text])))
);


--
-- Name: receipt_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings ALTER COLUMN id SET DEFAULT nextval('public.receipt_settings_id_seq'::regclass);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: adjustments adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustments
    ADD CONSTRAINT adjustments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_records backup_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_pkey PRIMARY KEY (id);


--
-- Name: bank_statement_transactions bank_statement_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_transactions
    ADD CONSTRAINT bank_statement_transactions_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: branch_stock branch_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_stock
    ADD CONSTRAINT branch_stock_pkey PRIMARY KEY (branch_id, product_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_registration_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_registration_code_key UNIQUE (registration_code);


--
-- Name: customer_sessions customer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_pkey PRIMARY KEY (id);


--
-- Name: customer_sessions customer_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_session_token_key UNIQUE (session_token);


--
-- Name: dining_tables dining_tables_business_id_branch_id_table_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_business_id_branch_id_table_number_key UNIQUE (business_id, branch_id, table_number);


--
-- Name: dining_tables dining_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_pkey PRIMARY KEY (id);


--
-- Name: email_notifications email_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_notifications
    ADD CONSTRAINT email_notifications_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_item_changes order_item_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_changes
    ADD CONSTRAINT order_item_changes_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_settings payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: platform_activity_logs platform_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_activity_logs
    ADD CONSTRAINT platform_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_email_key UNIQUE (email);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: platform_backups platform_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_backups
    ADD CONSTRAINT platform_backups_pkey PRIMARY KEY (id);


--
-- Name: platform_payments platform_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_payments
    ADD CONSTRAINT platform_payments_pkey PRIMARY KEY (id);


--
-- Name: platform_refunds platform_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_refunds
    ADD CONSTRAINT platform_refunds_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: receipt_settings receipt_settings_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_business_id_key UNIQUE (business_id);


--
-- Name: receipt_settings receipt_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: revenue_logs revenue_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_logs
    ADD CONSTRAINT revenue_logs_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_key UNIQUE (role);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: staff_shifts staff_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_replies support_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_replies
    ADD CONSTRAINT support_replies_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);


--
-- Name: two_factor_codes two_factor_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_codes
    ADD CONSTRAINT two_factor_codes_pkey PRIMARY KEY (id);


--
-- Name: two_factor_settings two_factor_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_settings
    ADD CONSTRAINT two_factor_settings_pkey PRIMARY KEY (id);


--
-- Name: two_factor_settings two_factor_settings_scope_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_settings
    ADD CONSTRAINT two_factor_settings_scope_business_id_key UNIQUE (scope, business_id);


--
-- Name: payment_settings unique_business_payment_settings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT unique_business_payment_settings UNIQUE (business_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_business_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_business_created_at_idx ON public.audit_logs USING btree (business_id, created_at DESC);


--
-- Name: branches_business_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_business_name_unique ON public.branches USING btree (business_id, lower(name));


--
-- Name: branches_one_main_per_business; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_one_main_per_business ON public.branches USING btree (business_id) WHERE (is_main = true);


--
-- Name: businesses_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX businesses_slug_unique ON public.businesses USING btree (slug);


--
-- Name: customer_sessions_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_sessions_token_idx ON public.customer_sessions USING btree (session_token);


--
-- Name: idx_audit_logs_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_business_id ON public.audit_logs USING btree (business_id);


--
-- Name: idx_email_notifications_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_notifications_business ON public.email_notifications USING btree (business_id);


--
-- Name: idx_email_notifications_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_notifications_sent_at ON public.email_notifications USING btree (sent_at DESC);


--
-- Name: idx_email_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_notifications_type ON public.email_notifications USING btree (notification_type);


--
-- Name: idx_notification_reads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_reads_user ON public.notification_reads USING btree (user_id, read_at DESC);


--
-- Name: idx_notifications_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_parent ON public.notifications USING btree (parent_id);


--
-- Name: idx_notifications_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_receiver ON public.notifications USING btree (receiver_id, created_at DESC);


--
-- Name: idx_notifications_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_sender ON public.notifications USING btree (sender_id, created_at DESC);


--
-- Name: idx_order_item_changes_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_item_changes_order ON public.order_item_changes USING btree (order_id);


--
-- Name: idx_order_item_changes_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_item_changes_product ON public.order_item_changes USING btree (product_id);


--
-- Name: idx_platform_activity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_activity_created ON public.platform_activity_logs USING btree (created_at DESC);


--
-- Name: idx_platform_payments_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_payments_business ON public.platform_payments USING btree (business_id);


--
-- Name: idx_platform_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_payments_status ON public.platform_payments USING btree (status);


--
-- Name: idx_product_categories_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_categories_business_id ON public.product_categories USING btree (business_id);


--
-- Name: idx_refunds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_status ON public.refunds USING btree (status, created_at DESC);


--
-- Name: idx_subscriptions_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_business_id ON public.subscriptions USING btree (business_id);


--
-- Name: idx_support_tickets_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_business_id ON public.support_tickets USING btree (business_id);


--
-- Name: idx_two_factor_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_two_factor_codes_expires_at ON public.two_factor_codes USING btree (expires_at);


--
-- Name: idx_two_factor_codes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_two_factor_codes_user_id ON public.two_factor_codes USING btree (user_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: orders_branch_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_branch_created_at_idx ON public.orders USING btree (branch_id, created_at DESC);


--
-- Name: orders_order_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_order_number_idx ON public.orders USING btree (order_number);


--
-- Name: orders_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_source_idx ON public.orders USING btree (source);


--
-- Name: payments_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_business_branch_idx ON public.payments USING btree (business_id, branch_id);


--
-- Name: payments_business_branch_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_business_branch_paid_at_idx ON public.payments USING btree (business_id, branch_id, paid_at DESC);


--
-- Name: payments_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_order_id_idx ON public.payments USING btree (order_id);


--
-- Name: platform_payments_pending_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_payments_pending_business_idx ON public.platform_payments USING btree (business_id, created_at DESC) WHERE ((status)::text = 'pending'::text);


--
-- Name: products_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_business_branch_idx ON public.products USING btree (business_id, branch_id);


--
-- Name: receipts_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_order_id_idx ON public.receipts USING btree (order_id);


--
-- Name: refunds_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_business_branch_idx ON public.refunds USING btree (business_id, branch_id);


--
-- Name: salary_payments_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salary_payments_business_branch_idx ON public.salary_payments USING btree (business_id, branch_id);


--
-- Name: salary_payments_processing_payouts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salary_payments_processing_payouts_idx ON public.salary_payments USING btree (business_id, branch_id, payout_requested_at) WHERE (status = 'processing'::text);


--
-- Name: staff_shifts_branch_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_shifts_branch_started_idx ON public.staff_shifts USING btree (branch_id, started_at DESC);


--
-- Name: staff_shifts_business_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_shifts_business_started_idx ON public.staff_shifts USING btree (business_id, started_at DESC);


--
-- Name: staff_shifts_one_open_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_shifts_one_open_per_user ON public.staff_shifts USING btree (user_id) WHERE (ended_at IS NULL);


--
-- Name: stock_movements_branch_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_branch_product_idx ON public.stock_movements USING btree (branch_id, product_id, created_at DESC);


--
-- Name: user_permissions_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_permissions_business_idx ON public.user_permissions USING btree (business_id);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: backup_records backup_records_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: bank_statement_transactions bank_statement_transactions_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_transactions
    ADD CONSTRAINT bank_statement_transactions_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.bank_statements(id) ON DELETE CASCADE;


--
-- Name: branch_stock branch_stock_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_stock
    ADD CONSTRAINT branch_stock_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_stock branch_stock_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_stock
    ADD CONSTRAINT branch_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: branches branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: customer_sessions customer_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sessions
    ADD CONSTRAINT customer_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dining_tables dining_tables_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: dining_tables dining_tables_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dining_tables dining_tables_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_notifications email_notifications_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_notifications
    ADD CONSTRAINT email_notifications_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: inventory inventory_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: inventory inventory_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_item_changes order_item_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_changes
    ADD CONSTRAINT order_item_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: order_item_changes order_item_changes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_changes
    ADD CONSTRAINT order_item_changes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_item_changes order_item_changes_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_changes
    ADD CONSTRAINT order_item_changes_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_item_changes order_item_changes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_changes
    ADD CONSTRAINT order_item_changes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: orders orders_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: orders orders_waiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_waiter_id_fkey FOREIGN KEY (waiter_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_platform_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_platform_admin_id_fkey FOREIGN KEY (platform_admin_id) REFERENCES public.platform_admins(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_settings payment_settings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: payments payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: payments payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: platform_payments platform_payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_payments
    ADD CONSTRAINT platform_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: platform_payments platform_payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_payments
    ADD CONSTRAINT platform_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: platform_refunds platform_refunds_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_refunds
    ADD CONSTRAINT platform_refunds_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: platform_refunds platform_refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_refunds
    ADD CONSTRAINT platform_refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.platform_payments(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: products products_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: products products_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;


--
-- Name: receipts receipts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: refunds refunds_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: refunds refunds_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: revenue_logs revenue_logs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenue_logs
    ADD CONSTRAINT revenue_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: salary_payments salary_payments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: salary_payments salary_payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: salary_payments salary_payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: salary_payments salary_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: shifts shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: staff_shifts staff_shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: staff_shifts staff_shifts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: staff_shifts staff_shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: stock_adjustments stock_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.users(id);


--
-- Name: stock_adjustments stock_adjustments_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: subscriptions subscriptions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: support_replies support_replies_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_replies
    ADD CONSTRAINT support_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.platform_admins(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: system_settings system_settings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: transfers transfers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: transfers transfers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: transfers transfers_from_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES public.users(id);


--
-- Name: transfers transfers_manager_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_manager_approved_by_fkey FOREIGN KEY (manager_approved_by) REFERENCES public.users(id);


--
-- Name: transfers transfers_to_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES public.users(id);


--
-- Name: two_factor_codes two_factor_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_codes
    ADD CONSTRAINT two_factor_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: two_factor_settings two_factor_settings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_settings
    ADD CONSTRAINT two_factor_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: users users_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: withdrawals withdrawals_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: withdrawals withdrawals_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: withdrawals withdrawals_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--



-- Mark migrations already reflected in this schema as applied
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.schema_migrations VALUES ('001_initial_schema.sql', '2026-07-14 22:30:05.017249+02');
INSERT INTO public.schema_migrations VALUES ('002_owner_module_additions.sql', '2026-07-15 16:26:04.349983+02');
INSERT INTO public.schema_migrations VALUES ('003_qr_ordering_system.sql', '2026-07-15 17:07:45.533119+02');
INSERT INTO public.schema_migrations VALUES ('004_manager_stock_menu.sql', '2026-07-15 22:30:26.123812+02');
INSERT INTO public.schema_migrations VALUES ('004_owner_full_module.sql', '2026-07-16 19:30:38.426504+02');
INSERT INTO public.schema_migrations VALUES ('005_add_username_to_users.sql', '2026-07-16 20:35:13.692529+02');
INSERT INTO public.schema_migrations VALUES ('006_add_avatar_to_users.sql', '2026-07-16 20:45:18.25439+02');
INSERT INTO public.schema_migrations VALUES ('007_add_order_status_values.sql', '2026-07-16 21:35:59.245049+02');
INSERT INTO public.schema_migrations VALUES ('008_notifications.sql', '2026-07-16 23:01:53.514827+02');
INSERT INTO public.schema_migrations VALUES ('009_bonus_promotion.sql', '2026-07-16 23:40:19.910646+02');
INSERT INTO public.schema_migrations VALUES ('010_add_orders_payment_method.sql', '2026-07-17 10:45:32.271379+02');
INSERT INTO public.schema_migrations VALUES ('011_add_kitchen_bar_roles.sql', '2026-07-17 11:01:26.686102+02');
INSERT INTO public.schema_migrations VALUES ('012_add_orders_station.sql', '2026-07-17 11:13:04.550169+02');
INSERT INTO public.schema_migrations VALUES ('013_add_notification_media.sql', '2026-07-17 12:46:05.18247+02');
INSERT INTO public.schema_migrations VALUES ('014_add_refunds.sql', '2026-07-17 13:33:27.405332+02');
INSERT INTO public.schema_migrations VALUES ('015_add_payroll_approval.sql', '2026-07-17 13:33:27.415845+02');
INSERT INTO public.schema_migrations VALUES ('016_add_operator_role.sql', '2026-07-18 12:06:59.251432+02');
INSERT INTO public.schema_migrations VALUES ('017_add_operator_role_enum.sql', '2026-07-18 12:06:59.275037+02');
INSERT INTO public.schema_migrations VALUES ('018_saas_platform.sql', '2026-07-19 11:07:50.263317+02');
INSERT INTO public.schema_migrations VALUES ('019_subscription_cycles_discounts.sql', '2026-07-19 13:20:27.213802+02');
INSERT INTO public.schema_migrations VALUES ('020_platform_admin_suite.sql', '2026-07-19 14:38:28.749653+02');
INSERT INTO public.schema_migrations VALUES ('021_seed_demo_products.sql', '2026-07-20 17:18:44.29111+02');
INSERT INTO public.schema_migrations VALUES ('002_create_reconciliations.sql', '2026-07-21 11:44:18.400915+02');
INSERT INTO public.schema_migrations VALUES ('003_create_accounts.sql', '2026-07-21 11:44:18.416101+02');
INSERT INTO public.schema_migrations VALUES ('004_create_reports.sql', '2026-07-21 13:59:46.265825+02');
INSERT INTO public.schema_migrations VALUES ('005_create_reconciliation_view.sql', '2026-07-21 14:56:11.449144+02');
INSERT INTO public.schema_migrations VALUES ('006_create_statement_and_adjustments.sql', '2026-07-21 15:25:14.360518+02');
INSERT INTO public.schema_migrations VALUES ('007_create_payment_settings.sql', '2026-07-21 21:08:44.361016+02');
INSERT INTO public.schema_migrations VALUES ('008_remove_subscription_limits.sql', '2026-07-21 22:48:31.354612+02');
INSERT INTO public.schema_migrations VALUES ('009_fix_orders_business_fk.sql', '2026-07-21 23:29:10.691405+02');
INSERT INTO public.schema_migrations VALUES ('010_create_subscription_plans.sql', '2026-07-22 18:34:18.971585+02');
INSERT INTO public.schema_migrations VALUES ('011_password_reset_tokens.sql', '2026-07-22 20:23:52.816379+02');
INSERT INTO public.schema_migrations VALUES ('012_product_categories.sql', '2026-07-22 21:46:20.169709+02');
INSERT INTO public.schema_migrations VALUES ('012_make_order_payment_nullable.sql', '2026-07-22 23:40:31.088958+02');
INSERT INTO public.schema_migrations VALUES ('013_two_factor_auth.sql', '2026-07-22 23:47:10.012145+02');
INSERT INTO public.schema_migrations VALUES ('003_email_notifications.sql', '2026-07-23 01:47:32.663028+02');
INSERT INTO public.schema_migrations VALUES ('014_password_reset_admins.sql', '2026-07-23 02:50:39.395834+02');
INSERT INTO public.schema_migrations VALUES ('015_order_restock.sql', '2026-07-23 20:03:50.43734+02');
INSERT INTO public.schema_migrations VALUES ('009_platform_admin_2fa.sql', '2026-07-25 09:15:00.8261+02');
INSERT INTO public.schema_migrations VALUES ('010_fix_audit_logs_business_id.sql', '2026-07-25 10:01:08.021072+02');
INSERT INTO public.schema_migrations VALUES ('001_add_user_id_to_orders.sql', '2026-07-25 11:01:29.543072+02');
INSERT INTO public.schema_migrations VALUES ('20260801_add_provider_fields_to_payments.sql', '2026-08-01 10:30:11.769276+02');
INSERT INTO public.schema_migrations VALUES ('20260803_add_customer_name_to_orders.sql', '2026-08-03 07:27:50.755783+02');
INSERT INTO public.schema_migrations VALUES ('20260803_add_business_description.sql', '2026-08-03 09:20:44.410028+02');
INSERT INTO public.schema_migrations VALUES ('20260803_add_receipt_settings.sql', '2026-08-03 09:37:04.369646+02');
INSERT INTO public.schema_migrations VALUES ('20260804_add_withdrawal_approval_columns.sql', '2026-08-04 11:49:09.523202+02');
INSERT INTO public.schema_migrations VALUES ('20260731_create_payments_table.sql', '2026-09-23 14:44:16.878703+02');
INSERT INTO public.schema_migrations VALUES ('20260810_create_platform_payments_tables.sql', '2026-09-23 14:44:16.885545+02');
INSERT INTO public.schema_migrations VALUES ('20260818_add_business_location_fields.sql', '2026-09-23 14:44:16.889097+02');
INSERT INTO public.schema_migrations VALUES ('20260818_add_salary_payment_columns.sql', '2026-09-23 14:44:16.890706+02');
INSERT INTO public.schema_migrations VALUES ('20260818_rename_hot_beverages_category.sql', '2026-09-23 14:44:16.894707+02');
INSERT INTO public.schema_migrations VALUES ('20260923_add_business_slug.sql', '2026-09-23 14:44:16.9051+02');
INSERT INTO public.schema_migrations VALUES ('20260925_add_business_tax_rate.sql', '2026-09-25 13:25:38.256654+02');
INSERT INTO public.schema_migrations VALUES ('20260925_allow_pending_payments.sql', '2026-09-25 13:25:38.291124+02');
INSERT INTO public.schema_migrations VALUES ('20260925_branch_isolation.sql', '2026-09-25 13:25:38.400682+02');
INSERT INTO public.schema_migrations VALUES ('20260926_assign_existing_users_to_main_branch.sql', '2026-09-25 13:25:38.405245+02');
INSERT INTO public.schema_migrations VALUES ('20260927_make_fina_bar_main_and_move_kigali_waiters.sql', '2026-09-25 13:26:10.041019+02');
INSERT INTO public.schema_migrations VALUES ('20260928_assign_all_users_to_main_branch.sql', '2026-09-25 13:26:10.044209+02');
INSERT INTO public.schema_migrations VALUES ('20260929_assign_existing_data_to_main_branch.sql', '2026-09-25 13:26:10.057478+02');
INSERT INTO public.schema_migrations VALUES ('20260930_initialize_branch_stock.sql', '2026-09-25 14:06:24.137708+02');
INSERT INTO public.schema_migrations VALUES ('20260928_add_unpaid_business_access.sql', '2026-09-28 10:11:50.630369+02');
INSERT INTO public.schema_migrations VALUES ('20260928_add_business_id_to_payments.sql', '2026-09-28 10:31:05.038546+02');
INSERT INTO public.schema_migrations VALUES ('20261005_add_branch_owned_products.sql', '2026-10-06 13:54:01.677401+02');
INSERT INTO public.schema_migrations VALUES ('20261024_add_subscription_payment_provider_fields.sql', '2026-10-24 19:49:55.326597+02');
INSERT INTO public.schema_migrations VALUES ('20261026_backfill_order_table_numbers.sql', '2026-10-26 08:35:11.465672+02');
INSERT INTO public.schema_migrations VALUES ('20261026_create_dining_tables.sql', '2026-10-26 08:35:11.587077+02');
INSERT INTO public.schema_migrations VALUES ('20261026_add_salary_payout_provider_fields.sql', '2026-10-26 12:58:26.933086+02');
INSERT INTO public.schema_migrations VALUES ('20261029_repair_branch_owned_stock.sql', '2026-10-29 09:07:35.93166+02');
INSERT INTO public.schema_migrations VALUES ('20261029_fix_order_station_assignments.sql', '2026-10-29 10:19:35.44845+02');
INSERT INTO public.schema_migrations VALUES ('20261119_create_staff_shifts.sql', '2026-11-19 14:42:28.756173+02');
INSERT INTO public.schema_migrations VALUES ('20261120_create_user_permissions.sql', '2026-11-19 14:42:28.770058+02');


--
-- PostgreSQL database dump complete
--


